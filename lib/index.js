'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var readFile = Promise.promisify(fs.readFile);
var pathUtil = require('path');
var util = require('util');

var defaultCache = {};
var sharedScriptCache = {};

function ScriptRunner(client, options) {
  options = options || {};
  this._client = client;
  this._base = options.base || null;
  this._sharedDetails = this._getSharedDetails(options.shared);
  this._scripts = this._getScriptCache();
  this._shared = null;
}

function noScriptTrap(err) {
  return /^NOSCRIPT/.test(err.message);
}


ScriptRunner.prototype._resolvePath = function (scriptPath) {
  if (pathUtil.extname(scriptPath) !== '.lua') {
    scriptPath += '.lua';
  }

  if (this._base) {
    return pathUtil.resolve(this._base, scriptPath);
  }
  return scriptPath;
};


ScriptRunner.prototype._getSharedDetails = function (sharedOpts) {
  if (!sharedOpts) {
    return null;
  }
  if (typeof sharedOpts === 'string') {
    return {
      path: this._resolvePath(sharedOpts),
      keys: [],
      argv: []
    };
  } else {
    return {
      path: this._resolvePath(sharedOpts.path),
      keys: sharedOpts.keys || [],
      argv: sharedOpts.argv || []
    };
  }
};


ScriptRunner.prototype._getScriptCache = function () {
  if (this._sharedDetails) {
    var cacheKey = util.format(
      '%s:%d:%d',
      this._sharedDetails.path,
      this._sharedDetails.keys.length,
      this._sharedDetails.argv.length
    );
    if (!sharedScriptCache[cacheKey]) {
      sharedScriptCache[cacheKey] = {};
    }
    return sharedScriptCache[cacheKey];
  } else {
    return defaultCache;
  }
};


ScriptRunner.prototype._getShared = function () {
  if (!this._shared) {
    if (this._sharedDetails) {
      var path = this._sharedDetails.path;
      this._shared = readFile(path, { encoding: 'utf-8' })
        .bind(this)
        .then(function (content) {
          return {
            path: path,
            content: content,
            offset: content.split('\n').length + 2,
            keys: this._sharedDetails.keys,
            argv: this._sharedDetails.argv
          };
        });
    } else {
      this._shared = Promise.resolve(null);
    }
  }

  return this._shared;
};

ScriptRunner.prototype._combine = function (shared, body) {
  if (shared === null) {
    return body;
  }

  return [
    shared.content,
    util.format('KEYS = {select(%d, unpack(KEYS))}', shared.keys.length + 1),
    util.format('ARGV = {select(%d, unpack(ARGV))}', shared.argv.length + 1),
    body
  ].join('\n');
};

ScriptRunner.prototype._loadScript = function (path) {
  if (!this._scripts[path]) {
    this._scripts[path] = Promise.all([
      this._getShared(),
      readFile(path, { encoding: 'utf-8' })
    ])
      .bind(this)
      .spread(function (shared, body) {
        var combined = this._combine(shared, body);
        return Promise.fromCallback(function (callback) {
          this._client.script('load', combined, callback);
        }.bind(this))
          .bind(this)
          .then(function (sha) {
            return {
              sha: sha,
              path: path,
              body: combined
            };
          });
      });
  }
  return this._scripts[path];
};

ScriptRunner.prototype._augmentError = function (path, error) {
  return this._getShared()
    .then(function (shared) {
      // figure out correct path and line number
      error.message = error.message
        .replace(/user_script:(\d+)/g, function (match, lineNumber) {
          if (!shared) {
            return path + ':' + lineNumber;
          }

          if (lineNumber <= shared.offset) {
            return shared.path + ':' + lineNumber;
          } else {
            return path + ':' + (lineNumber - shared.offset);
          }
        }.bind(this));

      throw error;
    });
};

ScriptRunner.prototype._readArray = function (args) {
  return args.map(function (arg) {
    if (typeof arg === 'function') {
      return arg();
    }
    return arg;
  });
};

ScriptRunner.prototype.run = function (path, keys, argv) {
  keys = this._readArray(keys || []);
  argv = this._readArray(argv || []);
  path = this._resolvePath(path);

  if (this._sharedDetails) {
    keys = this._readArray(this._sharedDetails.keys).concat(keys);
    argv = this._readArray(this._sharedDetails.argv).concat(argv);
  }

  var evalArgs = [keys.length].concat(keys).concat(argv);

  return this._loadScript(path)
    .bind(this)
    .then(function (script) {
      var args = [script.sha].concat(evalArgs);
      return Promise.fromCallback(function (callback) {
        this._client.evalsha.apply(this._client, args.concat(callback));
      }.bind(this))
        .bind(this)
        .catch(noScriptTrap, function () {
          // Script doesn't exist on Redis, reload it using plain eval
          var args = [script.body].concat(evalArgs);
          return Promise.fromCallback(function (callback) {
            this._client.eval.apply(this._client, args.concat(callback));
          }.bind(this));
        });
    })
    .catch(function (err) {
      return this._augmentError(path, err);
    });
};



module.exports = function (client, options) {
  return new ScriptRunner(client, options);
};

