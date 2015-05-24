var redis = require('then-redis');
var assert = require('chai').assert;
var redisScripts = require('..');

describe('then-redis-scripts', function () {

  var client = redis.createClient({
    host: '192.168.59.103'
  });

  beforeEach(function () {
    return client.flushall();
  });

  it('should run a script', function () {
    return redisScripts(client)
      .run(__dirname + '/set-key.lua', [ 'test' ], [ 'value' ])
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
          .run(__dirname + '/get-key.lua', [ 'test' ]);
      })
      .then(function (result) {
        assert.strictEqual(result, 'value');
      });
  });

  it('should handle user errors', function () {
    return redisScripts(client)
      .run(__dirname + '/error.lua')
      .then(function () {
        assert(false, 'Expected to fail');
      }, function (err) {
        assert.propertyVal(err, 'message', 'Error');
      });
  });

  it('should handle script errors', function () {
    var path = __dirname + '/redis-error.lua';
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
    var path = __dirname + '/get-key.lua';
    var scripts = redisScripts(client);
    return scripts.run(path, ['test'])
      .then(function () {
        return client.script('flush');
      })
      .then(function () {
        return scripts.run(path, ['test']);
      });
  });

});
