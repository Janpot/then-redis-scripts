'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var readFile = Promise.promisify(fs.readFile);
var pathUtil = require('path');

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
      var path = this._resolvePath(this._options.shared);
      this._shared = readFile(path, { encoding: 'utf-8' })
        .bind(this)
        .then(function (content) {
          return {
            path: path,
            content: content,
            offset: content.split('\n').length
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
  return shared.content + '\n' + body;
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
        return this._client.script('load', combined)
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
  var evalArgs = [keys.length].concat(keys).concat(argv);

  return this._loadScript(path)
    .bind(this)
    .then(function (script) {
      var args = [script.sha].concat(evalArgs);
      return this._client.evalsha.apply(this._client, args)
        .bind(this)
        .catch(noScriptTrap, function () {
          // Script doesn't exist on Redis, reload it using plain eval
          var args = [script.body].concat(evalArgs);
          return this._client.eval.apply(this._client, args);
        })
        .catch(function (err) {
          return this._augmentError(path, err);
        });
    });
};



module.exports = function (client, options) {
  return new ScriptRunner(client, options);
};

