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
        var i = err.message.indexOf('(call to ' + path + ')');
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

  // lua errors are not normalized, need to figure out how to handle call stack
  it.skip('should detect error in shared script', function () {
    var sharedPath = __dirname + '/lua/script-error.lua';
    var scripts = redisScripts(client, {
      shared: sharedPath
    });
    return scripts.run(__dirname + '/lua/get-key.lua')
      .then(function () {
        assert(false, 'Expected to fail');
      }, function (err) {
        var i = err.message.indexOf('(call to ' + sharedPath + ')');
        assert.operator(i, '>=', 0);
      });
  });

});
