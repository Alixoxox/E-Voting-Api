import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();

export const redisClient = createClient({ url: 'redis://redis:6379' });
redisClient.on('error', (err) => console.log('Redis Client Error', err));
await redisClient.connect();

export const pubClient = redisClient.duplicate();
export const subClient = redisClient.duplicate();
