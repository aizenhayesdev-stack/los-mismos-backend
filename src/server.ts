import app from "./app";
import { PORT } from "./config/environment";
import { createServer } from "http";
import { createSocketServer } from "./config/socket";
import { socketAuthMiddleware } from "./middleware/socket-auth.middleware";
import SocketHandlers from "./handlers/socket.handlers";
import { initializeFirebase } from "./config/firebase";
import { initializeRepeatingJobs, shutdownQueues } from "./config/bullmq";
import { initializeWorkers, shutdownWorkers } from "./workers";

const SERVER_PORT = PORT || 5000;

// Initialize Firebase Admin SDK (conditionally based on FCM_ENABLED)
try {
  initializeFirebase();
} catch (error) {
  console.error("❌ Firebase initialization failed:", error);
  // Only exit if FCM is supposed to be enabled
  const { getFCMConfig } = require("./config/environment");
  if (getFCMConfig().enabled) {
    console.error("❌ FCM is enabled but initialization failed - exiting");
    process.exit(1);
  } else {
    console.log(
      "ℹ️ FCM initialization failed but FCM is disabled - continuing"
    );
  }
}

// Create HTTP server
const server = createServer(app);

// Create Socket.io server
const io = createSocketServer(server);

// Apply authentication middleware to Socket.io
io.use(socketAuthMiddleware);

// Initialize socket handlers
const socketHandlers = new SocketHandlers(io);
socketHandlers.initializeHandlers();

// Initialize BullMQ workers and queues
async function initializeBullMQ() {
  try {
    await initializeWorkers();
    await initializeRepeatingJobs();
    console.log("✅ BullMQ system initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize BullMQ:", error);
    process.exit(1);
  }
}

// Start server
server.listen(SERVER_PORT, async () => {
  console.log(`🚀 Server running on port ${SERVER_PORT}`);
  console.log(`📡 Socket.io ready for connections`);
  console.log(`🔔 Notification system initialized`);

  // Initialize BullMQ after server starts
  await initializeBullMQ();
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("📴 SIGTERM received, shutting down gracefully...");

  await shutdownWorkers();
  await shutdownQueues();

  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("📴 SIGINT received, shutting down gracefully...");

  await shutdownWorkers();
  await shutdownQueues();

  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

export { io };
