import express from 'express';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerOptions } from './utils/swagerConfig.js';

// Routes
import cors from 'cors';
import userRoutes from './routes/userR.js';
import AdminRoutes from './routes/adminR.js';
import partyRoutes from './routes/partyR.js';
import publicRoutes from './routes/public.js';
import userM from './models/userM.js';
// DB initializer
import errorHandler from './middleware/errorHandler.js';
import { initTables } from './models/initializer.js';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

dotenv.config();
import { Server } from 'socket.io';
import http from 'http';

const app = express();
const server = http.createServer(app);
export let redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.on('error', (err) => console.log('Redis Client Error', err));
await redisClient.connect();

const pubClient = redisClient.duplicate();
const subClient = redisClient.duplicate();

const io = new Server(server, {
  cors: { origin: process.env.SOCKET_CORS_ORIGIN || "*" }
});
export { io };
io.adapter(createAdapter(pubClient, subClient));

app.use(cors());

// Pass `io` to routes if needed

app.use(express.json());
app.use(express.text({ type: 'text/csv' }));

const swaggerSpec = swaggerJsdoc(swaggerOptions);

(async () => {
  // 1ï¸âƒ£ Initialize DB tables
  await initTables();

  // 2ï¸âƒ£ Swagger UI route (add BEFORE your API routes)
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // 3ï¸âƒ£ Register all API routes
  app.use('/api/public',publicRoutes );
  app.use('/api/users', userRoutes);
  app.use('/api/parties', partyRoutes);
  app.use('/api/admin',AdminRoutes);
  app.use(errorHandler);
  // 4ï¸âƒ£ Start server
  io.on("connection", (socket) => {
    console.log(" User connected:", socket.id);
  
    socket.on("joinRoom", async (room) => {
      socket.join(room);
      console.log(`Joined room: ${room}`);
  
      // Extract areaId & electionId from room name: "const-<areaId>-<electionId>"
      const [_, areaId, electionId] = room.split("-");
  
      try {
        // Fetch current leaderboard even if no votes are cast yet
        let leaderboard;
        if(await redisClient.exists(`leaderboard:${areaId}:${electionId}`)){
          let cachedLeaderboard=await redisClient.get(`leaderboard:${areaId}:${electionId}`);
          leaderboard = JSON.parse(cachedLeaderboard);
        }else{
        leaderboard = await userM.viewCandidatesForUserElection(areaId, electionId);
        redisClient.setEx(`leaderboard:${areaId}:${electionId}`, 10, JSON.stringify(leaderboard));
        }
        // Emit directly to this user (not broadcast)
        socket.emit("leaderboardUpdate", { leaderboard });
        console.log(`ðŸ“¤ Sent initial leaderboard to ${socket.id}`);
      } catch (err) {
        console.error("Error fetching leaderboard:", err.message);
      }
    });
  
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
  server.listen(5000, () => {
    console.log(`  Server running on port 5000`);
    console.log(`ðŸ“š Swagger docs: http://localhost:5000/api-docs`);
  });
  
})();


