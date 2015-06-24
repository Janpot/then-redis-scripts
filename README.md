#then-redis-scripts

[travis-url]: http://travis-ci.org/Janpot/then-redis-scripts
[travis-image]: http://img.shields.io/travis/Janpot/then-redis-scripts.svg?style=flat

[depstat-url]: https://david-dm.org/Janpot/then-redis-scripts
[depstat-image]: http://img.shields.io/david/Janpot/then-redis-scripts.svg?style=flat

Script runner for the [then-redis](https://www.npmjs.com/package/then-redis) package.
This package loads scripts from the file system and caches them. Then uses EVALSHA to execute them.
Automatically reloads the script when it is removed from the db (SCRIP FLUSH).

[![Build Status][travis-image]][travis-url] [![Dependency Status][depstat-image]][depstat-url]

## Usage:

```js
var redis = require('then-redis');
var redisScripts = require('then-redis-scripts');

var client = redis.createClient();
var scripts = redisScripts(client, {
  base: __dirname + '/lua'
});

scripts.run('my-lua-script', [ 'key' ], [ 'argv1', 'argv2' ])
  .then(function (result) {
    console.log(result);
  });
```

Assuming there is a script `.../lua/my-lua-script.lua`

## API

##### `var scripts = redisScripts(RedisClient client, [Object options])`

**Returns:** `ScriptRunner`

Builds a script runner for a certain `then-redis` client.

###### Option `String base`

Base folder for relative paths.

###### Option `String shared`

path to a script that should be prepended to of every script that is run.

<hr>

##### `scripts.run(String path, [Array<String> keys], [Array<String> argv])`

**Returns:** `Promise<dynamic>`

Runs a script at `path`. The path is resolved against the base dir.
`.lua` extension is automatically added when not specified.
`keys` and `argv` can be passed as `KEYS` and `ARGV` variables in the script.


