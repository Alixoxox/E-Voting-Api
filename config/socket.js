import { createAdapter } from '@socket.io/redis-adapter';
import { redisClient, io } from '../server.js';

export function setupSocketAdapter() {
  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
  console.log('Socket.IO Redis adapter configured');
}
