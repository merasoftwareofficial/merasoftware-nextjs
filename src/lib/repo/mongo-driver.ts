/** MongoDB implementation of the shared blog repository contract. */

import { Types, type PipelineStage } from "mongoose";
import { DEFAULT_HOMEPAGE_CONTENT } from "@/lib/homepage-content";
import { connectMongo } from "@/lib/mongodb";
import { Blog } from "@/models/Blog";
import { CategoryModel } from "@/models/Category";
import { Comment, Report, Settings } from "@/models/Comment";
import { Reaction, SavedPost } from "@/models/Engagement";
import { User } from "@/models/User";
import { ViewDay, ViewSeen } from "@/models/View";
import { ShareDay } from "@/models/Share";
import { ClickDay } from "@/models/Click";
import { MediaAssetModel } from "@/models/Media";
import { SubscriberModel } from "@/models/Subscriber";
import { PushDeviceModel } from "@/models/PushDevice";
import { DeliveryModel, NotifyJobModel } from "@/models/NotifyJob";
import type {
  Blog as BlogRecord,
  BlogQuery,
  Category as CategoryRecord,
  ClickPlacement,
  Comment as CommentRecord,
  CommentStatus,
  DataDriver,
  ReactionKind,
  Report as ReportRecord,
  Settings as SettingsRecord,
  SharePlatform,
  NotifyJob as NotifyJobRecord,
  PushDevice as PushDeviceRecord,
  Subscriber as SubscriberRecord,
  User as UserRecord,
} from "./types";

const validId = (id: string) => Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(id);
const objectId = (id: string) => (validId(id) ? new Types.ObjectId(id) : null);
const iso = (value: Date | string | undefined) => (value ? new Date(value).toISOString() : undefined);

function serialize<T extends { _id: unknown; createdAt?: Date | string; updatedAt?: Date | string }>(row: T) {
  const raw = row as T & { blogId?: unknown; parentId?: unknown; targetId?: unknown; publishedAt?: unknown; scheduledFor?: unknown };
  return {
    ...row,
    _id: String(row._id),
    ...(row.createdAt ? { createdAt: iso(row.createdAt) } : {}),
    ...(row.updatedAt ? { updatedAt: iso(row.updatedAt) } : {}),
    ...(raw.blogId ? { blogId: String(raw.blogId) } : {}),
    ...(raw.parentId ? { parentId: String(raw.parentId) } : {}),
    ...(raw.targetId ? { targetId: String(raw.targetId) } : {}),
    ...(raw.publishedAt ? { publishedAt: iso(raw.publishedAt as Date | string) } : {}),
    ...(raw.scheduledFor ? { scheduledFor: iso(raw.scheduledFor as Date | string) } : {}),
  };
}

function blogRecord(row: Record<string, unknown>): BlogRecord {
  return serialize(row as never) as BlogRecord;
}
function userRecord(row: Record<string, unknown>): UserRecord {
  return serialize(row as never) as UserRecord;
}
function commentRecord(row: Record<string, unknown>): CommentRecord {
  return serialize(row as never) as CommentRecord;
}
function reportRecord(row: Record<string, unknown>): ReportRecord {
  return serialize(row as never) as ReportRecord;
}

function statusFilter(status?: CommentStatus | CommentStatus[]) {
  return status === undefined ? {} : { status: Array.isArray(status) ? { $in: status } : status };
}

/** The MongoDB filter for a BlogQuery; list, listCards and count share it. */
function blogFilter(query: BlogQuery) {
  const filter: Record<string, unknown> = {};
  for (const key of ["type", "status", "visibility"] as const) {
    const value = query[key];
    if (value !== undefined) filter[key] = Array.isArray(value) ? { $in: value } : value;
  }
  if (query.category !== undefined) filter.category = query.category;
  if (query.tag !== undefined) filter.tags = query.tag;
  if (query.authorId !== undefined) filter.authorId = query.authorId;
  if (query.noIndex !== undefined) filter.noIndex = query.noIndex;
  if (query.search?.trim()) {
    const safe = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(safe, "i");
    filter.$or = [{ title: pattern }, { excerpt: pattern }, { tags: pattern }];
  }
  return filter;
}

/** Newest first, as list() documents. `withContent: false` leaves the body in the database. */
async function blogRows(query: BlogQuery, withContent: boolean) {
  await connectMongo();
  const skip = Math.max(0, query.skip ?? 0);
  const pipeline: PipelineStage[] = [
    { $match: blogFilter(query) },
    { $addFields: { _sortDate: { $ifNull: ["$publishedAt", "$updatedAt"] } } },
    { $sort: { _sortDate: -1, _id: -1 } },
    { $skip: skip },
  ];
  if (query.limit !== undefined) pipeline.push({ $limit: Math.max(0, query.limit) });
  pipeline.push({ $project: withContent ? { _sortDate: 0 } : { _sortDate: 0, content: 0 } });
  const rows = await Blog.aggregate(pipeline);
  return rows.map((row: Record<string, unknown>) => blogRecord(row));
}

const blogs: DataDriver["blogs"] = {
  async list(query: BlogQuery = {}) {
    return blogRows(query, true);
  },

  async listCards(query: BlogQuery = {}) {
    return blogRows(query, false);
  },

  async count(query: BlogQuery = {}) {
    await connectMongo();
    return Blog.countDocuments(blogFilter(query));
  },

  async findById(id) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const row = await Blog.findById(_id).lean();
    return row ? blogRecord(row as unknown as Record<string, unknown>) : null;
  },

  async findByIds(ids) {
    const _ids = [...new Set(ids)].map(objectId).filter((id): id is Types.ObjectId => id !== null);
    if (!_ids.length) return [];
    await connectMongo();
    const rows = await Blog.find({ _id: { $in: _ids } }).lean();
    return rows.map((row: Record<string, unknown>) => blogRecord(row));
  },

  async findBySlug(slug) {
    await connectMongo();
    const row = await Blog.findOne({ slug }).lean();
    return row ? blogRecord(row as unknown as Record<string, unknown>) : null;
  },

  async create(data) {
    await connectMongo();
    const row = await Blog.create(data);
    return blogRecord(row.toObject() as unknown as Record<string, unknown>);
  },

  async update(id, patch) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const { _id: _ignoredId, createdAt: _ignoredCreated, updatedAt: _ignoredUpdated, ...safePatch } = patch;
    // Mongoose drops undefined from $set, so `scheduledFor: undefined` left the
    // old date behind. Undefined means "remove", as it does in the JSON driver.
    const entries = Object.entries(safePatch);
    const $set = Object.fromEntries(entries.filter(([, value]) => value !== undefined));
    const $unset = Object.fromEntries(entries.filter(([, value]) => value === undefined).map(([key]) => [key, ""]));
    const row = await Blog.findByIdAndUpdate(
      _id,
      Object.keys($unset).length ? { $set, $unset } : { $set },
      { new: true, runValidators: true },
    ).lean();
    return row ? blogRecord(row as unknown as Record<string, unknown>) : null;
  },

  async remove(id) {
    const _id = objectId(id);
    if (!_id) return false;
    await connectMongo();
    const result = await Blog.deleteOne({ _id });
    return result.deletedCount > 0;
  },

  async incr(id, field, by) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    // timestamps: false — a reaction or save is not an edit, and updatedAt is
    // the article's dateModified for search engines and the sitemap.
    // updatePipeline: Mongoose 9 refuses an array update without it, which
    // made every reaction and save fail on the Mongo driver.
    // Returns the new value, so a caller needs no second read for the count.
    const row = await Blog.findOneAndUpdate(
      { _id },
      [{ $set: { [field]: { $max: [0, { $add: [{ $ifNull: [`$${field}`, 0] }, by] }] } } }],
      { returnDocument: "after", projection: { [field]: 1 }, timestamps: false, updatePipeline: true },
    ).lean();
    return row ? Number((row as Record<string, unknown>)[field] ?? 0) : null;
  },

  async renameCategory(from, to) {
    await connectMongo();
    // timestamps: false — the category's name changed, not the article.
    const result = await Blog.updateMany({ category: from }, { $set: { category: to } }, { timestamps: false });
    return result.modifiedCount;
  },

  async categoryCounts() {
    await connectMongo();
    const rows: { _id: string; count: number }[] = await Blog.aggregate([
      { $match: { category: { $type: "string", $ne: "" } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map(row => [row._id, row.count]));
  },
};

function categoryRecord(row: Record<string, unknown>): CategoryRecord {
  const category = serialize(row as never) as CategoryRecord;
  // lean() skips schema defaults, as withSettingsDefaults() notes for settings.
  return { ...category, formerSlugs: category.formerSlugs ?? [] };
}

// isDuplicateKey is defined with the view counting below; the unique index on slug raises it.
const DUPLICATE_CATEGORY = "A category with that name already exists.";

const categories: DataDriver["categories"] = {
  async list() {
    await connectMongo();
    const rows = await CategoryModel.find().sort({ name: 1 }).collation({ locale: "en" }).lean();
    return rows.map((row: Record<string, unknown>) => categoryRecord(row));
  },
  async findById(id) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const row = await CategoryModel.findById(_id).lean();
    return row ? categoryRecord(row as unknown as Record<string, unknown>) : null;
  },
  async create(data) {
    await connectMongo();
    try {
      const row = await CategoryModel.create(data);
      return categoryRecord(row.toObject() as unknown as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateKey(error)) throw new Error(DUPLICATE_CATEGORY);
      throw error;
    }
  },
  async update(id, patch) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    try {
      const row = await CategoryModel.findByIdAndUpdate(_id, { $set: patch }, { new: true, runValidators: true }).lean();
      return row ? categoryRecord(row as unknown as Record<string, unknown>) : null;
    } catch (error) {
      if (isDuplicateKey(error)) throw new Error(DUPLICATE_CATEGORY);
      throw error;
    }
  },
  async remove(id) {
    const _id = objectId(id);
    if (!_id) return false;
    await connectMongo();
    const result = await CategoryModel.deleteOne({ _id });
    return result.deletedCount > 0;
  },
};

const users: DataDriver["users"] = {
  async findById(id) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const row = await User.findById(_id).lean();
    return row ? userRecord(row as unknown as Record<string, unknown>) : null;
  },
  async findByIds(ids) {
    const _ids = [...new Set(ids)].map(objectId).filter((id): id is Types.ObjectId => id !== null);
    if (!_ids.length) return [];
    await connectMongo();
    const rows = await User.find({ _id: { $in: _ids } }).lean();
    return rows.map((row: Record<string, unknown>) => userRecord(row));
  },
  async findByEmail(email) {
    await connectMongo();
    const row = await User.findOne({ email: email.trim().toLowerCase() }).lean();
    return row ? userRecord(row as unknown as Record<string, unknown>) : null;
  },
  async findByUsername(username) {
    await connectMongo();
    const row = await User.findOne({ username: username.trim().toLowerCase() }).lean();
    return row ? userRecord(row as unknown as Record<string, unknown>) : null;
  },
  async findByPortalUserId(portalUserId) {
    await connectMongo();
    const row = await User.findOne({ portalUserId }).lean();
    return row ? userRecord(row as unknown as Record<string, unknown>) : null;
  },
  async list() {
    await connectMongo();
    const rows = await User.find().sort({ createdAt: 1 }).lean();
    return rows.map((row: Record<string, unknown>) => userRecord(row));
  },
  async create(data) {
    await connectMongo();
    const row = await User.create({ ...data, email: data.email.trim().toLowerCase(), username: data.username.trim().toLowerCase() });
    return userRecord(row.toObject() as unknown as Record<string, unknown>);
  },
  async update(id, patch) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const { _id: _ignoredId, createdAt: _ignoredCreated, updatedAt: _ignoredUpdated, ...safePatch } = patch;
    if (safePatch.email) safePatch.email = safePatch.email.trim().toLowerCase();
    if (safePatch.username) safePatch.username = safePatch.username.trim().toLowerCase();
    const row = await User.findByIdAndUpdate(_id, { $set: safePatch }, { new: true, runValidators: true }).lean();
    return row ? userRecord(row as unknown as Record<string, unknown>) : null;
  },
};

const comments: DataDriver["comments"] = {
  async listByBlog(blogId, status) {
    const blogObjectId = objectId(blogId);
    if (!blogObjectId) return [];
    await connectMongo();
    const rows = await Comment.find({ blogId: blogObjectId, ...statusFilter(status) }).sort({ createdAt: 1 }).lean();
    return rows.map((row: Record<string, unknown>) => commentRecord(row));
  },
  async list(status) {
    await connectMongo();
    const rows = await Comment.find(statusFilter(status)).sort({ createdAt: -1 }).lean();
    return rows.map((row: Record<string, unknown>) => commentRecord(row));
  },
  async findById(id) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const row = await Comment.findById(_id).lean();
    return row ? commentRecord(row as unknown as Record<string, unknown>) : null;
  },
  async create(data) {
    const blogId = objectId(data.blogId);
    const parentId = data.parentId ? objectId(data.parentId) : null;
    if (!blogId || (data.parentId && !parentId)) throw new Error("Invalid blog or parent comment id.");
    await connectMongo();
    const row = await Comment.create({ ...data, blogId, ...(parentId ? { parentId } : {}) });
    return commentRecord(row.toObject() as unknown as Record<string, unknown>);
  },
  async update(id, patch) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const { _id: _ignoredId, createdAt: _ignoredCreated, updatedAt: _ignoredUpdated, ...safePatch } = patch;
    if (safePatch.blogId) {
      const blogId = objectId(safePatch.blogId);
      if (!blogId) return null;
      safePatch.blogId = blogId as unknown as string;
    }
    if (safePatch.parentId) {
      const parentId = objectId(safePatch.parentId);
      if (!parentId) return null;
      safePatch.parentId = parentId as unknown as string;
    }
    const row = await Comment.findByIdAndUpdate(_id, { $set: safePatch }, { new: true, runValidators: true }).lean();
    return row ? commentRecord(row as unknown as Record<string, unknown>) : null;
  },
  async remove(id) {
    const _id = objectId(id);
    if (!_id) return false;
    await connectMongo();
    const result = await Comment.deleteMany({ $or: [{ _id }, { parentId: _id }] });
    return result.deletedCount > 0;
  },
};

const reactions: DataDriver["reactions"] = {
  async find(userId, targetId, reaction: ReactionKind) {
    const target = objectId(targetId);
    if (!target) return null;
    await connectMongo();
    const row = await Reaction.findOne({ userId, targetId: target, reaction }).lean();
    return row ? serialize(row as never) as { _id: string; userId: string; targetId: string; reaction: ReactionKind; createdAt: string } : null;
  },
  async listByUser(userId, targetIds) {
    await connectMongo();
    const query: Record<string, unknown> = { userId };
    if (targetIds !== undefined) {
      const ids = targetIds.map(objectId).filter((id): id is Types.ObjectId => id !== null);
      query.targetId = { $in: ids };
    }
    const rows = await Reaction.find(query).sort({ createdAt: -1 }).lean();
    return rows.map((row: Record<string, unknown>) => serialize(row as never) as { _id: string; userId: string; targetId: string; reaction: ReactionKind; createdAt: string });
  },
  async create(data) {
    const targetId = objectId(data.targetId);
    if (!targetId) throw new Error("Invalid blog id.");
    await connectMongo();
    const row = await Reaction.create({ ...data, targetId });
    return serialize(row.toObject() as never) as { _id: string; userId: string; targetId: string; reaction: ReactionKind; createdAt: string };
  },
  async remove(id) {
    const _id = objectId(id);
    if (!_id) return false;
    await connectMongo();
    const result = await Reaction.deleteOne({ _id });
    return result.deletedCount > 0;
  },
};

const saved: DataDriver["saved"] = {
  async find(userId, blogId) {
    const target = objectId(blogId);
    if (!target) return null;
    await connectMongo();
    const row = await SavedPost.findOne({ userId, blogId: target }).lean();
    return row ? serialize(row as never) as { _id: string; userId: string; blogId: string; createdAt: string } : null;
  },
  async listByUser(userId) {
    await connectMongo();
    const rows = await SavedPost.find({ userId }).sort({ createdAt: -1 }).lean();
    return rows.map((row: Record<string, unknown>) => serialize(row as never) as { _id: string; userId: string; blogId: string; createdAt: string });
  },
  async create(data) {
    const blogId = objectId(data.blogId);
    if (!blogId) throw new Error("Invalid blog id.");
    await connectMongo();
    const row = await SavedPost.create({ ...data, blogId });
    return serialize(row.toObject() as never) as { _id: string; userId: string; blogId: string; createdAt: string };
  },
  async remove(id) {
    const _id = objectId(id);
    if (!_id) return false;
    await connectMongo();
    const result = await SavedPost.deleteOne({ _id });
    return result.deletedCount > 0;
  },
};

const reports: DataDriver["reports"] = {
  async list(resolved) {
    await connectMongo();
    const rows = await Report.find(resolved === undefined ? {} : { resolved }).sort({ createdAt: -1 }).lean();
    return rows.map((row: Record<string, unknown>) => reportRecord(row));
  },
  async create(data) {
    await connectMongo();
    const row = await Report.create(data);
    return reportRecord(row.toObject() as unknown as Record<string, unknown>);
  },
  async update(id, patch) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const { _id: _ignoredId, createdAt: _ignoredCreated, ...safePatch } = patch;
    const row = await Report.findByIdAndUpdate(_id, { $set: safePatch }, { new: true, runValidators: true }).lean();
    return row ? reportRecord(row as unknown as Record<string, unknown>) : null;
  },
};

const SETTINGS_DEFAULTS = {
  commentDefault: "visible",
  commentsEnabled: true,
  viewsPublic: false,
  shareEnabled: true,
  sharePlatforms: ["whatsapp", "facebook", "x", "linkedin", "telegram", "email", "copy"],
  categoriesSeeded: false,
} as const;

/**
 * lean() skips schema defaults, so a row saved before a setting existed would
 * come back without it. Missing keys take their default here, as the JSON
 * driver does.
 */
function withSettingsDefaults(row: unknown): SettingsRecord {
  return {
    ...SETTINGS_DEFAULTS,
    sharePlatforms: [...SETTINGS_DEFAULTS.sharePlatforms],
    ...serialize(row as { _id: unknown }),
  } as SettingsRecord;
}

const settings: DataDriver["settings"] = {
  async get() {
    await connectMongo();
    // A plain read: pages call this on every article view. Until an admin first
    // saves, the row does not exist and the defaults apply — the same answer the
    // JSON driver gives; update() creates the row.
    const row = await Settings.findById("site").lean();
    if (!row) return withSettingsDefaults({ _id: "site", homepageImages: {}, updatedAt: new Date().toISOString() });
    return withSettingsDefaults(row);
  },
  async update(patch) {
    await connectMongo();
    // MongoDB rejects one path in both $set and $setOnInsert ("would create a
    // conflict"), so the insert defaults leave out whatever this patch sets.
    const insertDefaults = Object.fromEntries(Object.entries(SETTINGS_DEFAULTS).filter(([key]) => !(key in patch)));
    const row = await Settings.findOneAndUpdate(
      { _id: "site" },
      { $set: patch, $setOnInsert: insertDefaults },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return withSettingsDefaults(row);
  },
  async updateHomepageSection(section, content, images) {
    await connectMongo();
    // Initialise old sites once, then update only this section's paths atomically.
    await Settings.updateOne(
      { _id: "site" },
      { $setOnInsert: { ...SETTINGS_DEFAULTS, homepageContent: DEFAULT_HOMEPAGE_CONTENT } },
      { upsert: true },
    );
    await Settings.updateOne(
      { _id: "site", homepageContent: { $exists: false } },
      { $set: { homepageContent: DEFAULT_HOMEPAGE_CONTENT } },
    );
    const set: Record<string, unknown> = { [`homepageContent.${section}`]: content };
    const unset: Record<string, 1> = {};
    for (const [slot, image] of Object.entries(images)) {
      if (image === null) unset[`homepageImages.${slot}`] = 1;
      else if (image) set[`homepageImages.${slot}`] = image;
    }
    const row = await Settings.findOneAndUpdate(
      { _id: "site" },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { new: true, runValidators: true },
    ).lean();
    return withSettingsDefaults(row);
  },
};

const media: DataDriver["media"] = {
  async list() {
    await connectMongo();
    const rows = await MediaAssetModel.find().sort({ createdAt: -1 }).lean();
    return rows.map(row => serialize(row as never) as import("./types").MediaAsset);
  },
  async findByIds(ids) {
    const validIds = ids.filter(id => Types.ObjectId.isValid(id));
    if (!validIds.length) return [];
    await connectMongo();
    const rows = await MediaAssetModel.find({ _id: { $in: validIds } }).lean();
    return rows.map(row => serialize(row as never) as import("./types").MediaAsset);
  },
  async findByChecksum(sha256) {
    await connectMongo();
    const row = await MediaAssetModel.findOne({ sha256 }).lean();
    return row ? serialize(row as never) as import("./types").MediaAsset : null;
  },
  async create(data) {
    await connectMongo();
    const row = await MediaAssetModel.create(data);
    return serialize(row.toObject() as never) as import("./types").MediaAsset;
  },
  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    await connectMongo();
    const row = await MediaAssetModel.findById(id).lean();
    return row ? serialize(row as never) as import("./types").MediaAsset : null;
  },
  async updateAltText(id, altText) {
    if (!Types.ObjectId.isValid(id)) return null;
    await connectMongo();
    const row = await MediaAssetModel.findByIdAndUpdate(id, { altText }, { new: true, runValidators: true }).lean();
    return row ? serialize(row as never) as import("./types").MediaAsset : null;
  },
  async remove(id) {
    if (!Types.ObjectId.isValid(id)) return false;
    await connectMongo();
    const result = await MediaAssetModel.deleteOne({ _id: id });
    return result.deletedCount > 0;
  },
};

const SEEN_FOR_MS = 24 * 60 * 60 * 1000;
const isDuplicateKey = (error: unknown) => (error as { code?: number })?.code === 11000;

/**
 * Claim a visitor key for 24 hours; false when it is already held. Inserts the
 * key, or takes over one whose 24 hours are up but the TTL monitor (which runs
 * about once a minute) has not removed yet. A key still inside its 24 hours
 * fails the filter, the upsert then collides on _id, and nothing is counted.
 * Views and shares both claim here; their keys never collide (share-rules.ts).
 */
async function claimKey(visitorKey: string) {
  const cutoff = new Date(Date.now() - SEEN_FOR_MS);
  try {
    await ViewSeen.updateOne({ _id: visitorKey, at: { $lte: cutoff } }, { $set: { at: new Date() } }, { upsert: true });
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

const views: DataDriver["views"] = {
  async record(blogId, visitorKey, day) {
    const _id = objectId(blogId);
    if (!_id) return false;
    await connectMongo();
    if (!(await claimKey(visitorKey))) return false;

    try {
      await ViewDay.updateOne({ blogId, day }, { $inc: { count: 1 } }, { upsert: true });
    } catch (error) {
      // Two first views of the day raced on the upsert; the row exists now.
      if (!isDuplicateKey(error)) throw error;
      await ViewDay.updateOne({ blogId, day }, { $inc: { count: 1 } });
    }
    // timestamps: false — a view must leave updatedAt alone.
    await Blog.updateOne({ _id }, { $inc: { viewCount: 1 } }, { timestamps: false });
    return true;
  },

  async sumSince(day, blogIds) {
    await connectMongo();
    const match: Record<string, unknown> = { day: { $gte: day } };
    if (blogIds) match.blogId = { $in: blogIds };
    const rows: { _id: string; total: number }[] = await ViewDay.aggregate([
      { $match: match },
      { $group: { _id: "$blogId", total: { $sum: "$count" } } },
    ]);
    return Object.fromEntries(rows.map(row => [row._id, row.total]));
  },
};

const shares: DataDriver["shares"] = {
  async record(blogId, platform, visitorKey, day) {
    const _id = objectId(blogId);
    if (!_id) return false;
    await connectMongo();
    if (!(await claimKey(visitorKey))) return false;

    try {
      await ShareDay.updateOne({ blogId, day, platform }, { $inc: { count: 1 } }, { upsert: true });
    } catch (error) {
      // Two first shares of the day raced on the upsert; the row exists now.
      if (!isDuplicateKey(error)) throw error;
      await ShareDay.updateOne({ blogId, day, platform }, { $inc: { count: 1 } });
    }
    // timestamps: false — a share must leave updatedAt alone.
    await Blog.updateOne({ _id }, { $inc: { shareCount: 1 } }, { timestamps: false });
    return true;
  },

  async sumSince(day, blogIds) {
    await connectMongo();
    const match: Record<string, unknown> = { day: { $gte: day } };
    if (blogIds) match.blogId = { $in: blogIds };
    const rows: { _id: string; total: number }[] = await ShareDay.aggregate([
      { $match: match },
      { $group: { _id: "$blogId", total: { $sum: "$count" } } },
    ]);
    return Object.fromEntries(rows.map(row => [row._id, row.total]));
  },

  async byPlatform(blogIds) {
    await connectMongo();
    const rows: { _id: { blogId: string; platform: SharePlatform }; total: number }[] = await ShareDay.aggregate([
      ...(blogIds ? [{ $match: { blogId: { $in: blogIds } } }] : []),
      { $group: { _id: { blogId: "$blogId", platform: "$platform" }, total: { $sum: "$count" } } },
    ]);
    const result: Record<string, Partial<Record<SharePlatform, number>>> = {};
    for (const row of rows) (result[row._id.blogId] ??= {})[row._id.platform] = row.total;
    return result;
  },
};

const clicks: DataDriver["clicks"] = {
  async record(blogId, placement, visitorKey, day) {
    const _id = objectId(blogId);
    if (!_id) return false;
    await connectMongo();
    if (!(await claimKey(visitorKey))) return false;

    try {
      await ClickDay.updateOne({ blogId, day, placement }, { $inc: { count: 1 } }, { upsert: true });
    } catch (error) {
      // Two first clicks of the day raced on the upsert; the row exists now.
      if (!isDuplicateKey(error)) throw error;
      await ClickDay.updateOne({ blogId, day, placement }, { $inc: { count: 1 } });
    }
    // timestamps: false — a click must leave updatedAt alone.
    await Blog.updateOne({ _id }, { $inc: { clickCount: 1 } }, { timestamps: false });
    return true;
  },

  async sumSince(day, blogIds) {
    await connectMongo();
    const match: Record<string, unknown> = { day: { $gte: day } };
    if (blogIds) match.blogId = { $in: blogIds };
    const rows: { _id: string; total: number }[] = await ClickDay.aggregate([
      { $match: match },
      { $group: { _id: "$blogId", total: { $sum: "$count" } } },
    ]);
    return Object.fromEntries(rows.map(row => [row._id, row.total]));
  },

  async byPlacement(blogIds) {
    await connectMongo();
    const rows: { _id: { blogId: string; placement: ClickPlacement }; total: number }[] = await ClickDay.aggregate([
      ...(blogIds ? [{ $match: { blogId: { $in: blogIds } } }] : []),
      { $group: { _id: { blogId: "$blogId", placement: "$placement" }, total: { $sum: "$count" } } },
    ]);
    const result: Record<string, Partial<Record<ClickPlacement, number>>> = {};
    for (const row of rows) (result[row._id.blogId] ??= {})[row._id.placement] = row.total;
    return result;
  },
};

/* ---------------------------------------------------------- subscribers -- */

function subscriberRecord(row: Record<string, unknown>): SubscriberRecord {
  const subscriber = serialize(row as never) as SubscriberRecord;
  return {
    ...subscriber,
    categories: subscriber.categories ?? [],
    emailConfirmedAt: iso(row.emailConfirmedAt as Date | undefined),
    confirmSentAt: iso(row.confirmSentAt as Date | undefined),
  };
}

const subscribers: DataDriver["subscribers"] = {
  async findById(id) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const row = await SubscriberModel.findById(_id).lean();
    return row ? subscriberRecord(row as unknown as Record<string, unknown>) : null;
  },
  async findByEmail(email) {
    await connectMongo();
    const row = await SubscriberModel.findOne({ email: email.trim().toLowerCase() }).lean();
    return row ? subscriberRecord(row as unknown as Record<string, unknown>) : null;
  },
  async findByUserId(userId) {
    await connectMongo();
    const row = await SubscriberModel.findOne({ userId }).lean();
    return row ? subscriberRecord(row as unknown as Record<string, unknown>) : null;
  },
  async findByToken(token) {
    if (!token) return null;
    await connectMongo();
    const row = await SubscriberModel.findOne({ token }).lean();
    return row ? subscriberRecord(row as unknown as Record<string, unknown>) : null;
  },
  async create(data) {
    await connectMongo();
    try {
      const row = await SubscriberModel.create(data);
      return subscriberRecord(row.toObject() as unknown as Record<string, unknown>);
    } catch (error) {
      // Same messages as the JSON driver, for two requests racing on one address or account.
      if (isDuplicateKey(error)) {
        throw new Error((error as { keyPattern?: Record<string, unknown> }).keyPattern?.userId ? "This account already has notification settings." : "That email is already subscribed.");
      }
      throw error;
    }
  },
  async update(id, patch) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    // Undefined means "remove", as in blogs.update().
    const entries = Object.entries(patch);
    const $set = Object.fromEntries(entries.filter(([, value]) => value !== undefined));
    const $unset = Object.fromEntries(entries.filter(([, value]) => value === undefined).map(([key]) => [key, ""]));
    const row = await SubscriberModel.findByIdAndUpdate(
      _id,
      Object.keys($unset).length ? { $set, $unset } : { $set },
      { new: true, runValidators: true },
    ).lean();
    return row ? subscriberRecord(row as unknown as Record<string, unknown>) : null;
  },
  async remove(id) {
    const _id = objectId(id);
    if (!_id) return false;
    await connectMongo();
    const result = await SubscriberModel.deleteOne({ _id });
    return result.deletedCount > 0;
  },
  async replaceCategory(fromId, toId) {
    await connectMongo();
    // Two steps, because one update cannot both $addToSet and $pull the same array.
    const result = await SubscriberModel.updateMany({ categories: fromId }, { $addToSet: { categories: toId } });
    await SubscriberModel.updateMany({ categories: fromId }, { $pull: { categories: fromId } });
    return result.matchedCount;
  },
  async removeCategory(id) {
    await connectMongo();
    const result = await SubscriberModel.updateMany({ categories: id }, { $pull: { categories: id } });
    return result.modifiedCount;
  },
  async listByCategory(categoryId) {
    await connectMongo();
    const rows = await SubscriberModel.find({ categories: categoryId }).lean();
    return rows.map((row: Record<string, unknown>) => subscriberRecord(row));
  },
};

/* --------------------------------------------------------- push devices -- */

function pushDeviceRecord(row: Record<string, unknown>): PushDeviceRecord {
  return serialize(row as never) as PushDeviceRecord;
}

const pushDevices: DataDriver["pushDevices"] = {
  async upsert(data) {
    await connectMongo();
    const row = await PushDeviceModel.findOneAndUpdate(
      { endpoint: data.endpoint },
      { $set: data },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return pushDeviceRecord(row as unknown as Record<string, unknown>);
  },
  async findByEndpoint(endpoint) {
    await connectMongo();
    const row = await PushDeviceModel.findOne({ endpoint }).lean();
    return row ? pushDeviceRecord(row as unknown as Record<string, unknown>) : null;
  },
  async listBySubscribers(subscriberIds) {
    if (!subscriberIds.length) return [];
    await connectMongo();
    const rows = await PushDeviceModel.find({ subscriberId: { $in: subscriberIds } }).lean();
    return rows.map((row: Record<string, unknown>) => pushDeviceRecord(row));
  },
  async removeByEndpoint(endpoint) {
    await connectMongo();
    const result = await PushDeviceModel.deleteOne({ endpoint });
    return result.deletedCount > 0;
  },
  async moveSubscriber(fromId, toId) {
    await connectMongo();
    const result = await PushDeviceModel.updateMany({ subscriberId: fromId }, { $set: { subscriberId: toId } });
    return result.modifiedCount;
  },
};

/* --------------------------------------------------- notification queue -- */

function notifyJobRecord(row: Record<string, unknown>): NotifyJobRecord {
  const job = serialize(row as never) as NotifyJobRecord;
  return { ...job, lockedUntil: iso(row.lockedUntil as Date | undefined) };
}

const notifyJobs: DataDriver["notifyJobs"] = {
  async create(data) {
    await connectMongo();
    try {
      const row = await NotifyJobModel.create({ ...data, status: "queued", sent: 0, failed: 0 });
      return notifyJobRecord(row.toObject() as unknown as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateKey(error)) return null;
      throw error;
    }
  },
  async listOpen(limit) {
    await connectMongo();
    const rows = await NotifyJobModel.find({ status: { $in: ["queued", "running"] } }).sort({ createdAt: 1 }).limit(limit).lean();
    return rows.map((row: Record<string, unknown>) => notifyJobRecord(row));
  },
  async claim(id, lockedUntil) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    // One atomic step, so two runners can never both take the job.
    const row = await NotifyJobModel.findOneAndUpdate(
      { _id, $or: [{ status: "queued" }, { status: "running", lockedUntil: { $lt: new Date() } }] },
      { $set: { status: "running", lockedUntil: new Date(lockedUntil) } },
      { new: true },
    ).lean();
    return row ? notifyJobRecord(row as unknown as Record<string, unknown>) : null;
  },
  async finish(id, patch) {
    const _id = objectId(id);
    if (!_id) return;
    await connectMongo();
    await NotifyJobModel.updateOne({ _id }, { $set: patch, $unset: { lockedUntil: "" } });
  },
  async release(id) {
    const _id = objectId(id);
    if (!_id) return;
    await connectMongo();
    await NotifyJobModel.updateOne({ _id }, { $set: { status: "queued" }, $unset: { lockedUntil: "" } });
  },
};

const deliveries: DataDriver["deliveries"] = {
  async claim(key) {
    await connectMongo();
    try {
      await DeliveryModel.create({ _id: key, at: new Date() });
      return true;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  },
};

export const mongoDriver: DataDriver = { blogs, categories, users, comments, reactions, saved, reports, settings, media, views, shares, clicks, subscribers, pushDevices, notifyJobs, deliveries };
