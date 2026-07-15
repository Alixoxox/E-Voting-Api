import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from './redis.js';

const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { success: false, error: { message: message || 'Too many requests, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
});

export const authLimiter = createRateLimiter(
  60 * 1000, 10, 'Too many auth attempts, please try again later.'
);

export const voteLimiter = createRateLimiter(
  60 * 1000, 5, 'Too many vote attempts, please slow down.'
);

export const csvUploadLimiter = createRateLimiter(
  15 * 60 * 1000, 10, 'Too many CSV uploads, please try again later.'
);

export const generalLimiter = createRateLimiter(
  60 * 1000, 60, 'Too many requests, please slow down.'
);

export const adminLimiter = createRateLimiter(
  60 * 1000, 20, 'Too many admin requests, please slow down.'
);

export { createRateLimiter };
