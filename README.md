#then-redis-scripts

Script runner for the [then-redis](https://www.npmjs.com/package/then-redis) package.
This package loads scripts from the file system and caches them. Then uses EVALSHA to execute them.
Automatically reloads the script when it is removed from the db (SCRIP FLUSH).

## Usage:

```js
var redis = require('then-redis');
var redisScripts = require('then-redis-scripts');

var client = redis.createClient();
var scripts = redisScripts(client);

scripts.run(__dirname + 'my-lua-script.lua', [ 'key' ], [ 'argv1', 'argv2' ])
  .then(function (result) {
    console.log(result);
  });
```

## API

`var scripts = redisScripts(client)`

Builds a script runner for a certain `then-redis` client.

`scripts.run(path, [keys], [argv]`

Runs a script at `path`. `keys` and `argv` can optionally be passed as `KEYS` and `ARGV` variables in lua.


