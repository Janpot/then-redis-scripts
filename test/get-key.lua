local key = unpack(KEYS)
return redis.call('GET', key)
