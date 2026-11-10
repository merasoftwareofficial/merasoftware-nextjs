import mongoose from "mongoose";

const globalForMongo = global as typeof globalThis & { mongoose?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } };
const cached = globalForMongo.mongoose ?? (globalForMongo.mongoose = { conn: null, promise: null });

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required. Add a local MongoDB connection string to .env.local.");
  if (cached.conn) return cached.conn;
  cached.promise ??= mongoose
    // Each Vercel function instance keeps its own pool. The free Atlas tier allows about 500
    // connections in total, and the default pool (100 per instance) let traffic spikes reach it.
    // A small pool, with idle connections closed after 30s, keeps every instance light.
    .connect(uri, { dbName: process.env.MONGODB_DB || "merasoftware", maxPoolSize: 5, maxIdleTimeMS: 30_000 })
    .catch(error => {
      cached.promise = null;
      throw error;
    });
  cached.conn = await cached.promise;
  return cached.conn;
}
