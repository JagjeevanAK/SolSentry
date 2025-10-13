import type { RedisOptions } from 'ioredis';

export const redisConnection: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
};
