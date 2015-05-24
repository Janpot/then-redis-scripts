'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var readFile = Promise.promisify(fs.readFile);

function ScriptRunner(client) {
  this._client = client;
  this._scripts = {};
}

function noScriptTrap(err) {
  return /^NOSCRIPT/.test(err.message);
}

ScriptRunner.prototype._loadScript = function (path) {
  if (!this._scripts[path]) {
    this._scripts[path] = readFile(path, { encoding: 'utf-8' })
      .bind(this)
      .then(function (body) {
        return this._client.script('load', body)
          .bind(this)
          .then(function (sha) {
            return {
              sha: sha,
              body: body
            };
          });
      });
  }
  return this._scripts[path];
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
          var args = [script.body].concat(evalArgs);
          return this._client.eval.apply(this._client, args);
        })
        .catch(function (err) {
          var paths = Object.keys(this._scripts);
          var scriptPromises = paths.map(function (path) {
            return this._scripts[path];
          }, this);
          return Promise.all(scriptPromises)
            .then(function (scripts) {
              paths.forEach(function (path, i) {
                var sha = scripts[i].sha;
                err.message = err.message.replace('f_' + sha, path);
              }, this);
              return Promise.reject(err);
            });
        });
    });
};



module.exports = function (client) {
  return new ScriptRunner(client);
};

