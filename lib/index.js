'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var readFile = Promise.promisify(fs.readFile);
var pathUtil = require('path');
var util = require('util');

function ScriptRunner(client, options) {
  this._client = client;
  this._options = options || {};
  this._scripts = {};
  this._shared = null;
}

function noScriptTrap(err) {
  return /^NOSCRIPT/.test(err.message);
}


ScriptRunner.prototype._resolvePath = function (scriptPath) {
  if (pathUtil.extname(scriptPath) !== '.lua') {
    scriptPath += '.lua';
  }

  if (this._options.base) {
    return pathUtil.resolve(this._options.base, scriptPath);
  }
  return scriptPath;
};


ScriptRunner.prototype._getShared = function () {
  if (!this._shared) {
    if (this._options.shared) {
      var path;
      if (typeof this._options.shared === 'string') {
        path = this._resolvePath(this._options.shared);
      } else {
        path = this._resolvePath(this._options.shared.path);
      }
      this._shared = readFile(path, { encoding: 'utf-8' })
        .bind(this)
        .then(function (content) {
          return {
            path: path,
            content: content,
            offset: content.split('\n').length + 2
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

  var sharedKeysCount = 0;
  var sharedArgvCount = 0;

  if (typeof this._options.shared === 'object') {
    if (this._options.shared.keys) {
      sharedKeysCount = this._options.shared.keys.length;
    }
    if (this._options.shared.argv) {
      sharedArgvCount = this._options.shared.argv.length;
    }
  }

  return [
    shared.content,
    util.format('KEYS = {select(%d, unpack(KEYS))}', sharedKeysCount + 1),
    util.format('ARGV = {select(%d, unpack(ARGV))}', sharedArgvCount + 1),
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

ScriptRunner.prototype.run = function (path, keys, argv) {
  keys = keys || [];
  argv = argv || [];
  path = this._resolvePath(path);

  if (typeof this._options.shared === 'object') {
    var sharedKeys = this._options.shared.keys || [];
    var sharedArgv = this._options.shared.argv || [];
    keys = sharedKeys.concat(keys);
    argv = sharedArgv.concat(argv);
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

