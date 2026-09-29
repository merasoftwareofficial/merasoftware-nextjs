/**
 * Data layer entry point.
 *
 * Import repos from here only — never from a driver file directly. Switching
 * the whole app to MongoDB is then one environment variable:
 *
 *   DATA_DRIVER=json   local JSON files in .data/  (current)
 *   DATA_DRIVER=mongo  MongoDB through Mongoose    (after migration)
 */

import { jsonDriver } from "./json-driver";
import { mongoDriver } from "./mongo-driver";
import type { DataDriver } from "./types";

const driverName = process.env.DATA_DRIVER === "mongo" ? "mongo" : "json";

const driver: DataDriver = driverName === "mongo" ? mongoDriver : jsonDriver;

export const blogRepo = driver.blogs;
export const userRepo = driver.users;
export const commentRepo = driver.comments;
export const reactionRepo = driver.reactions;
export const savedRepo = driver.saved;
export const reportRepo = driver.reports;
export const settingsRepo = driver.settings;
export const viewRepo = driver.views;

/** Which store is active. Shown on the admin overview so the stage is never unclear. */
export const activeDriver = driverName;

export * from "./types";
