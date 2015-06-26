var redis = require('then-redis');
var assert = require('chai').assert;
var redisScripts = require('..');

describe('then-redis-scripts', function () {

  var client = redis.createClient({
    host: process.env.REDIS_HOST
  });

  beforeEach(function () {
    return client.flushall();
  });

  it('should run a script', function () {
    return redisScripts(client)
      .run(__dirname + '/lua/set-key.lua', [ 'test' ], [ 'value' ])
      .then(function (result) {
        return client.get('test');
      })
      .then(function (value) {
        assert.strictEqual(value, 'value');
      });
  });

  it('should return a script result', function () {
    return client.set('test', 'value')
      .then(function () {
        return redisScripts(client)
          .run(__dirname + '/lua/get-key.lua', [ 'test' ]);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
      });
  });

  it('should handle user errors', function () {
    return redisScripts(client)
      .run(__dirname + '/lua/error.lua')
      .then(function () {
        assert(false, 'Expected to fail');
      }, function (err) {
        assert.propertyVal(err, 'message', 'Error');
      });
  });

  it('should handle script errors', function () {
    var path = __dirname + '/lua/redis-error.lua';
    return redisScripts(client)
      .run(path)
      .then(function () {
        assert(false, 'Expected to fail');
      }, function (err) {
        var i = err.message.indexOf(path + ':1');
        assert.operator(i, '>=', 0);
      });
  });

  it('should handle script flush', function () {
    var path = __dirname + '/lua/get-key.lua';
    var scripts = redisScripts(client);
    return scripts.run(path, ['test'])
      .then(function () {
        return client.script('flush');
      })
      .then(function () {
        return scripts.run(path, ['test']);
      });
  });

  it('should handle non-existing script', function () {
    var path = __dirname + '/lua/non-existing.lua';
    var scripts = redisScripts(client);
    return scripts.run(path, ['test'])
      .then(function () {
        assert(false, 'Expected to fail');
      }, function (err) {
        assert.match(err.message, /^ENOENT/);
      });
  });

  it('should handle shared scripts', function () {
    var scripts = redisScripts(client, {
      shared: __dirname + '/lua/init-variable.lua'
    });
    return scripts.run(__dirname + '/lua/read-variable.lua')
      .then(function (value) {
        assert.strictEqual(value, 'value');
      });
  });

  it('should handle shared scripts as object', function () {
    var scripts = redisScripts(client, {
      shared: {
        path: __dirname + '/lua/init-variable.lua'
      }
    });
    return scripts.run(__dirname + '/lua/read-variable.lua')
      .then(function (value) {
        assert.strictEqual(value, 'value');
      });
  });

  it('should detect error with shared script', function () {
    var path = __dirname + '/lua/script-error.lua';
    var scripts = redisScripts(client, {
      shared: __dirname + '/lua/init-variable.lua'
    });
    return scripts.run(path)
      .then(function () {
        assert(false, 'Expected to fail');
      }, function (err) {
        var i = err.message.indexOf(path + ':2');
        assert.operator(i, '>=', 0);
      });
  });

  it('should detect error in shared script', function () {
    var sharedPath = __dirname + '/lua/script-error.lua';
    var scripts = redisScripts(client, {
      shared: sharedPath
    });
    return scripts.run(__dirname + '/lua/get-key.lua')
      .then(function () {
        assert(false, 'Expected to fail');
      }, function (err) {
        var i = err.message.indexOf(sharedPath + ':2');
        assert.operator(i, '>=', 0);
      });
  });

  it('should detect compile errors', function () {
    var path = __dirname + '/lua/compile-error.lua';
    var scripts = redisScripts(client);
    return scripts.run(path)
      .then(function () {
        assert(false, 'Expected to fail');
      }, function (err) {
        var i = err.message.indexOf(path + ':1');
        assert.operator(i, '>=', 0);
      });
  });

  it('should handle relative paths', function () {
    var scripts = redisScripts(client, {
      base: __dirname + '/lua'
    });
    return client.set('test', 'value')
      .then(function () {
        return scripts.run('get-key.lua', [ 'test' ]);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
      });
  });

  it('should handle .lua extension', function () {
    var scripts = redisScripts(client);
    return client.set('test', 'value')
      .then(function () {
        return scripts.run(__dirname + '/lua/get-key', [ 'test' ]);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
      });
  });

  it('should handle absolute paths with base set', function () {
    var scripts = redisScripts(client, {
      base: __dirname + '/lua'
    });
    return client.set('test', 'value')
      .then(function () {
        return scripts.run(__dirname + '/lua/get-key.lua', [ 'test' ]);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
      });
  });

  it('should handle relative paths in shared script', function () {
    var scripts = redisScripts(client, {
      base: __dirname + '/lua',
      shared: 'init-variable.lua'
    });
    return scripts.run('read-variable.lua')
      .then(function (value) {
        assert.strictEqual(value, 'value');
      });
  });

  it('should handle shared script input', function () {
    var scripts = redisScripts(client, {
      base: __dirname + '/lua',
      shared: {
        path: 'shared-inputs-1',
        keys: ['key1', 'key2'],
        argv: ['value1']
      }
    });
    return scripts.run('shared-inputs-2', ['key3'], ['value2', 'value3'])
      .then(function (results) {
        assert.deepEqual(results, [
          'key1',
          'key2',
          'key3',
          'value1',
          'value2',
          'value3'
        ]);
      });
  });

});
