import Redis from "ioredis";

// Use REDIS_URL if provided, else fallback to host/port
const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true })
  : new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

// Socket.io adapter pub/sub clients
export const pubClient = redisUrl
  ? new Redis(redisUrl)
  : new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
    });

export const subClient = pubClient.duplicate();

// Redis key generators
export const RedisKeys = {
  seatHold: (routeId: string, seatLabel: string, departureDate?: string) => 
    departureDate ? `hold:${routeId}:${seatLabel}:${departureDate}` : `hold:${routeId}:${seatLabel}`,
  tripSeats: (routeId: string, departureDate?: string) => 
    departureDate ? `seats:${routeId}:${departureDate}` : `seats:${routeId}`,
  userHolds: (userId: string) => `user:holds:${userId}`,
  tripLock: (routeId: string, seatLabel: string, departureDate?: string) => 
    departureDate ? `lock:${routeId}:${seatLabel}:${departureDate}` : `lock:${routeId}:${seatLabel}`,
  departureDateSeats: (busId: string, departureDate: string) => `bus:${busId}:seats:${departureDate}`,
  departureDateHolds: (busId: string, departureDate: string) => `bus:${busId}:holds:${departureDate}`,
};

// Connection logs
redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("❌ Redis connection error:", err));

pubClient.on("connect", () => console.log("✅ Redis pub client connected"));
pubClient.on("error", (err) => console.error("❌ Redis pub client error:", err));

subClient.on("connect", () => console.log("✅ Redis sub client connected"));
subClient.on("error", (err) => console.error("❌ Redis sub client error:", err));

export default redis;
