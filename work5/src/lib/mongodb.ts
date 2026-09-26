import mongoose from "mongoose";

const globalForMongo = global as typeof globalThis & { mongoose?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } };
const cached = globalForMongo.mongoose ?? (globalForMongo.mongoose = { conn: null, promise: null });

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required. Add a local MongoDB connection string to .env.local.");
  if (cached.conn) return cached.conn;
  cached.promise ??= mongoose.connect(uri, { dbName: "merasoftware_dev" });
  cached.conn = await cached.promise;
  return cached.conn;
}
