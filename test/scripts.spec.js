var Promise = require('bluebird');
var redis = require('redis');
var assert = require('chai').assert;
var sinon = require('sinon');

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

describe('then-redis-scripts', function () {

  var client = redis.createClient({
    host: process.env.REDIS_HOST
  });
  var scriptSpy = sinon.spy(client, 'script');
  var evalshaSpy = sinon.spy(client, 'evalsha');
  var evalSpy = sinon.spy(client, 'eval');

  function resetSpies() {
    scriptSpy.reset();
    evalshaSpy.reset();
    evalSpy.reset();
  }

  beforeEach(function () {
    // completely clean the module as it holds global variables that need to be reset in between test
    var name = require.resolve('..');
    delete require.cache[name];
    resetSpies();
    return client.flushallAsync();
  });

  after(function () {
    client.script.restore();
    client.evalsha.restore();
    client.eval.restore();
  });

  it('should run a script', function () {
    var redisScripts = require('..');
    return redisScripts(client)
      .run(__dirname + '/lua/set-key.lua', [ 'test' ], [ 'value' ])
      .then(function (result) {
        return client.getAsync('test');
      })
      .then(function (value) {
        assert.strictEqual(value, 'value');
        assert.strictEqual(scriptSpy.callCount, 1);
        assert.strictEqual(evalshaSpy.callCount, 1);
        assert.strictEqual(evalSpy.callCount, 0);
      });
  });

  it('should return a script result', function () {
    return client.setAsync('test', 'value')
      .then(function () {
        var redisScripts = require('..');
        return redisScripts(client)
          .run(__dirname + '/lua/get-key.lua', [ 'test' ]);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
      });
  });

  it('should handle user errors', function () {
    var redisScripts = require('..');
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
    var redisScripts = require('..');
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
    var redisScripts = require('..');
    var scripts = redisScripts(client);
    return client.setAsync('test', 'value')
      .then(function () {
        return scripts.run(path, ['test']);
      })
      .then(function () {
        return client.scriptAsync('flush');
      })
      .then(function () {
        resetSpies();
        return scripts.run(path, ['test']);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
        assert.strictEqual(scriptSpy.callCount, 0);
        assert.strictEqual(evalshaSpy.callCount, 1);
        assert.strictEqual(evalSpy.callCount, 1);
        resetSpies();
        return scripts.run(path, ['test']);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
        assert.strictEqual(scriptSpy.callCount, 0);
        assert.strictEqual(evalshaSpy.callCount, 1);
        // the eval should have filled script cache again
        assert.strictEqual(evalSpy.callCount, 0);
        return scripts.run(path, ['test']);
      });
  });

  it('should handle non-existing script', function () {
    var path = __dirname + '/lua/non-existing.lua';
    var redisScripts = require('..');
    var scripts = redisScripts(client);
    return scripts.run(path, ['test'])
      .then(function () {
        assert(false, 'Expected to fail');
      }, function (err) {
        assert.match(err.message, /^ENOENT/);
      });
  });

  it('should handle shared scripts', function () {
    var redisScripts = require('..');
    var scripts = redisScripts(client, {
      shared: __dirname + '/lua/init-variable.lua'
    });
    return scripts.run(__dirname + '/lua/read-variable.lua')
      .then(function (value) {
        assert.strictEqual(value, 'value');
      });
  });

  it('should handle shared scripts as object', function () {
    var redisScripts = require('..');
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
    var redisScripts = require('..');
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
    var redisScripts = require('..');
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
    var redisScripts = require('..');
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
    var redisScripts = require('..');
    var scripts = redisScripts(client, {
      base: __dirname + '/lua'
    });
    return client.setAsync('test', 'value')
      .then(function () {
        return scripts.run('get-key.lua', [ 'test' ]);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
      });
  });

  it('should handle .lua extension', function () {
    var redisScripts = require('..');
    var scripts = redisScripts(client);
    return client.setAsync('test', 'value')
      .then(function () {
        return scripts.run(__dirname + '/lua/get-key', [ 'test' ]);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
      });
  });

  it('should handle absolute paths with base set', function () {
    var redisScripts = require('..');
    var scripts = redisScripts(client, {
      base: __dirname + '/lua'
    });
    return client.setAsync('test', 'value')
      .then(function () {
        return scripts.run(__dirname + '/lua/get-key.lua', [ 'test' ]);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
      });
  });

  it('should handle relative paths in shared script', function () {
    var redisScripts = require('..');
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
    var redisScripts = require('..');
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

  it('should handle multiple instances', function () {
    var redisScripts = require('..');
    var scripts1 = redisScripts(client, { base: __dirname + '/lua' });
    var scripts2 = redisScripts(client, { base: __dirname + '/lua' });
    return Promise.all([
      scripts1.run('get-key', ['test']),
      scripts2.run('get-key', ['test'])
    ])
      .then(function () {
        assert.strictEqual(scriptSpy.callCount, 1);
        assert.strictEqual(evalshaSpy.callCount, 2);
        assert.strictEqual(evalSpy.callCount, 0);
      });
  });

  it('should handle multiple instances with same shared scripts', function () {
    var redisScripts = require('..');
    var scripts1 = redisScripts(client, {
      base: __dirname + '/lua',
      shared: 'shared-inputs-1'
    });
    var scripts2 = redisScripts(client, {
      base: __dirname + '/lua',
      shared: {
        path: 'shared-inputs-1'
      }
    });
    return Promise.all([
      scripts1.run('get-key', ['test']),
      scripts2.run('get-key', ['test'])
    ])
      .then(function () {
        assert.strictEqual(scriptSpy.callCount, 1);
        assert.strictEqual(evalshaSpy.callCount, 2);
        assert.strictEqual(evalSpy.callCount, 0);
      });
  });

  it('should handle multiple instances with different shared scripts', function () {
    var redisScripts = require('..');
    var scripts1 = redisScripts(client, {
      base: __dirname + '/lua',
      shared: 'shared-inputs-1'
    });
    var scripts2 = redisScripts(client, {
      base: __dirname + '/lua',
      shared: {
        path: 'shared-3'
      }
    });
    return Promise.all([
      scripts1.run('get-key', ['test']),
      scripts2.run('get-key', ['test'])
    ])
      .then(function () {
        assert.strictEqual(scriptSpy.callCount, 2);
        assert.strictEqual(evalshaSpy.callCount, 2);
        assert.strictEqual(evalSpy.callCount, 0);
      });
  });

  it('should handle multiple instances with and without shared scripts', function () {
    var redisScripts = require('..');
    var scripts1 = redisScripts(client, { base: __dirname + '/lua' });
    var scripts2 = redisScripts(client, {
      base: __dirname + '/lua',
      shared: 'shared-inputs-1'
    });
    return Promise.all([
      scripts1.run('get-key', ['test']),
      scripts2.run('get-key', ['test'])
    ])
      .then(function () {
        assert.strictEqual(scriptSpy.callCount, 2);
        assert.strictEqual(evalshaSpy.callCount, 2);
        assert.strictEqual(evalSpy.callCount, 0);
      });
  });

  it('should handle multiple instances with different amount of keys', function () {
    var redisScripts = require('..');
    var scripts1 = redisScripts(client, {
      base: __dirname + '/lua',
      shared: {
        path: 'shared-3',
        keys: ['key1']
      }
    });
    var scripts2 = redisScripts(client, {
      base: __dirname + '/lua',
      shared: {
        path: 'shared-3'
      }
    });
    return Promise.all([
      scripts1.run('get-key', ['key']),
      scripts2.run('get-key', ['key1', 'key2'])
    ])
      .then(function () {
        assert.strictEqual(scriptSpy.callCount, 2);
        assert.strictEqual(evalshaSpy.callCount, 2);
        assert.strictEqual(evalSpy.callCount, 0);
      });
  });

  it('should handle multiple instances with different amount of args', function () {
    var redisScripts = require('..');
    var scripts1 = redisScripts(client, {
      base: __dirname + '/lua',
      shared: {
        path: 'shared-3',
        argv: ['arg']
      }
    });
    var scripts2 = redisScripts(client, {
      base: __dirname + '/lua',
      shared: {
        path: 'shared-3'
      }
    });
    return Promise.all([
      scripts1.run('get-key', ['key']),
      scripts2.run('get-key', ['test'])
    ])
      .then(function () {
        assert.strictEqual(scriptSpy.callCount, 2);
        assert.strictEqual(evalshaSpy.callCount, 2);
        assert.strictEqual(evalSpy.callCount, 0);
      });
  });

  it('should calculate keys', function () {
    var redisScripts = require('..');
    var scripts = redisScripts(client, { base: __dirname + '/lua' });
    return scripts.run('echo-keys', [
      function () {
        return 'the key';
      }
    ])
      .then(function (result) {
        assert.strictEqual(result[0], 'the key');
      });
  });

  it('should calculate argv', function () {
    var redisScripts = require('..');
    var scripts = redisScripts(client, { base: __dirname + '/lua' });
    return scripts.run('echo-argv', [], [
      function () {
        return 'the arg';
      }
    ])
      .then(function (result) {
        assert.strictEqual(result[0], 'the arg');
      });
  });

  it('should calculate shared keys', function () {
    var redisScripts = require('..');
    var i = 0;
    var scripts = redisScripts(client, {
      base: __dirname + '/lua',
      shared: {
        path: 'store-keys',
        keys: [
          function () {
            i += 1;
            return 'the key ' + i;
          }
        ]
      }
    });
    return scripts.run('echo-memory')
      .then(function (result) {
        assert.strictEqual(result[0], 'the key 1');
        return scripts.run('echo-memory');
      })
      .then(function (result) {
        assert.strictEqual(result[0], 'the key 2');
      });
  });

  it('should calculate shared argv', function () {
    var redisScripts = require('..');
    var i = 0;
    var scripts = redisScripts(client, {
      base: __dirname + '/lua',
      shared: {
        path: 'store-argv',
        argv: [
          function () {
            i += 1;
            return 'the arg ' + i;
          }
        ]
      }
    });
    return scripts.run('echo-memory')
      .then(function (result) {
        assert.strictEqual(result[0], 'the arg 1');
        return scripts.run('echo-memory');
      })
      .then(function (result) {
        assert.strictEqual(result[0], 'the arg 2');
      });
  });
});

