'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var readFile = Promise.promisify(fs.readFile);

function ScriptRunner(client, options) {
  this._client = client;
  this._options = options || {};
  this._scripts = {};
  this._shaMap = {};
  this._shared = null;
}

function noScriptTrap(err) {
  return /^NOSCRIPT/.test(err.message);
}


ScriptRunner.prototype._getShared = function () {
  if (!this._shared) {
    var path = this._options.shared;

    if (path) {
      this._shared = readFile(path, { encoding: 'utf-8' })
        .bind(this)
        .then(function (content) {
          return {
            content: content
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
            var scriptDetails = {
              sha: sha,
              path: path,
              body: combined
            };
            this._shaMap[sha] = scriptDetails;
            return scriptDetails;
          });
      });
  }
  return this._scripts[path];
};

ScriptRunner.prototype._substituteShaInError = function (error) {
  Object.keys(this._shaMap)
    .forEach(function (sha) {
      var path = this._shaMap[sha].path;
      error.message = error.message.replace('f_' + sha, path);
    }, this);
  return error;
};

ScriptRunner.prototype.run = function (path, keys, argv) {
  keys = keys || [];
  argv = argv || [];
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
          this._substituteShaInError(err);
          throw err;
        });
    });
};



module.exports = function (client, options) {
  return new ScriptRunner(client, options);
};

