/**
 * MongoDB driver — NOT IMPLEMENTED YET.
 *
 * This file is the migration seam. When local MongoDB is set up, each repo
 * below gets a Mongoose implementation using the existing models in
 * src/models/. Nothing outside this file changes: the API routes already talk
 * to the interfaces in ./types, and ./index picks the driver from DATA_DRIVER.
 *
 * Migration steps, for later:
 *   1. Set MONGODB_URI in .env.local and start MongoDB.
 *   2. Implement the repos here with connectMongo() + the Mongoose models.
 *   3. Set DATA_DRIVER=mongo in .env.local.
 *   4. Optionally import the .data/*.json rows once as a seed.
 */

import type { DataDriver } from "./types";

function notReady(): never {
  throw new Error(
    "The MongoDB driver is not implemented yet. Set DATA_DRIVER=json in .env.local, " +
      "or implement src/lib/repo/mongo-driver.ts first.",
  );
}

export const mongoDriver: DataDriver = {
  blogs: {
    list: notReady,
    count: notReady,
    findById: notReady,
    findBySlug: notReady,
    create: notReady,
    update: notReady,
    remove: notReady,
    incr: notReady,
  },
  users: {
    findById: notReady,
    findByEmail: notReady,
    findByUsername: notReady,
    list: notReady,
    create: notReady,
    update: notReady,
  },
  comments: {
    listByBlog: notReady,
    list: notReady,
    findById: notReady,
    create: notReady,
    update: notReady,
    remove: notReady,
  },
  reactions: { find: notReady, listByUser: notReady, create: notReady, remove: notReady },
  saved: { find: notReady, listByUser: notReady, create: notReady, remove: notReady },
  reports: { list: notReady, create: notReady, update: notReady },
  settings: { get: notReady, update: notReady },
};
