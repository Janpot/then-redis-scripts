# then-redis-scripts

[travis-url]: https://travis-ci.org/Janpot/then-redis-scripts
[travis-image]: https://img.shields.io/travis/Janpot/then-redis-scripts.svg?style=flat

[depstat-url]: https://david-dm.org/Janpot/then-redis-scripts
[depstat-image]: https://img.shields.io/david/Janpot/then-redis-scripts.svg?style=flat

Script runner for the [redis](https://www.npmjs.com/package/redis) package.
This package loads scripts from the file system and caches them. Then uses EVALSHA to execute them.
Automatically reloads the script when it is removed from the db (`SCRIPT FLUSH`).

[![Build Status][travis-image]][travis-url] [![Dependency Status][depstat-image]][depstat-url]

## Usage:

```js
var redis = require('redis');
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

Builds a script runner for a certain `redis` client.

###### Option `String base`

Base folder for relative paths.

###### Option `String|Object shared`

Either the path to a script that should be prepended to every script that is run.

Or an object with following properties:

 - `String path`: path to the shared script.
 - `Array<String> keys`: Optional array containg KEYS for the shared script. If this array conatins a function it will be executed to obtain the value for a key each time the script is run.
 - `Array<String> argv`: Optional array containing ARGV for the shared script. If this array conatins a function it will be executed to obtain the value for an argument each time the script is run.

 Calculating shared arguments on the fly can be useful when you want to pass a timestamp or a random seed for instance.

<hr>

##### `scripts.run(String path, [Array<String> keys], [Array<String> argv])`

**Returns:** `Promise<dynamic>`

Runs a script at `path`. The path is resolved against the base dir.
`.lua` extension is automatically added when not specified.
`keys` and `argv` can be passed as `KEYS` and `ARGV` variables in the script.


