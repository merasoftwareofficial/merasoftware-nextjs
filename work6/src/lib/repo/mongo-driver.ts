/** MongoDB implementation of the shared blog repository contract. */

import { Types, type PipelineStage } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { Blog } from "@/models/Blog";
import { Comment, Report, Settings } from "@/models/Comment";
import { Reaction, SavedPost } from "@/models/Engagement";
import { User } from "@/models/User";
import type {
  Blog as BlogRecord,
  BlogQuery,
  Comment as CommentRecord,
  CommentStatus,
  DataDriver,
  ReactionKind,
  Report as ReportRecord,
  Settings as SettingsRecord,
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

const blogs: DataDriver["blogs"] = {
  async list(query: BlogQuery = {}) {
    await connectMongo();
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

    const skip = Math.max(0, query.skip ?? 0);
    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $addFields: { _sortDate: { $ifNull: ["$publishedAt", "$updatedAt"] } } },
      { $sort: { _sortDate: -1, _id: -1 } },
      { $skip: skip },
    ];
    if (query.limit !== undefined) pipeline.push({ $limit: Math.max(0, query.limit) });
    pipeline.push({ $project: { _sortDate: 0 } });
    const rows = await Blog.aggregate(pipeline);
    return rows.map((row: Record<string, unknown>) => blogRecord(row));
  },

  async count(query: BlogQuery = {}) {
    await connectMongo();
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
    return Blog.countDocuments(filter);
  },

  async findById(id) {
    const _id = objectId(id);
    if (!_id) return null;
    await connectMongo();
    const row = await Blog.findById(_id).lean();
    return row ? blogRecord(row as unknown as Record<string, unknown>) : null;
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
    const row = await Blog.findByIdAndUpdate(_id, { $set: safePatch }, { new: true, runValidators: true }).lean();
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
    if (!_id) return;
    await connectMongo();
    await Blog.updateOne(
      { _id },
      [{ $set: { [field]: { $max: [0, { $add: [{ $ifNull: [`$${field}`, 0] }, by] }] }, updatedAt: "$$NOW" } }],
    );
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

const SETTINGS_DEFAULTS = { _id: "site", commentDefault: "visible", commentsEnabled: true } as const;
const settings: DataDriver["settings"] = {
  async get() {
    await connectMongo();
    const row = await Settings.findOneAndUpdate(
      { _id: "site" },
      { $setOnInsert: SETTINGS_DEFAULTS },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return serialize(row as never) as SettingsRecord;
  },
  async update(patch) {
    await connectMongo();
    const row = await Settings.findOneAndUpdate(
      { _id: "site" },
      { $set: patch, $setOnInsert: SETTINGS_DEFAULTS },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return serialize(row as never) as SettingsRecord;
  },
};

export const mongoDriver: DataDriver = { blogs, users, comments, reactions, saved, reports, settings };
