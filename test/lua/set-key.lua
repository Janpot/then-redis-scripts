local key = unpack(KEYS)
local value = unpack(ARGV)
return redis.call('SET', key, value)
