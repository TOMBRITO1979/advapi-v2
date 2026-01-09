import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

export const redis = new Redis(redisConfig);

redis.on('connect', () => {
  console.log('Redis conectado');
});

redis.on('error', (err) => {
  console.error('Erro Redis:', err);
});
