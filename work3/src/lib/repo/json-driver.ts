/**
 * JSON file driver — the temporary local store.
 *
 * Data lives in .data/<collection>.json (gitignored). Server-side only: this
 * module uses node:fs and must never be imported from a client component.
 *
 * It exists so the whole blog can be built and used before MongoDB is set up.
 * The MongoDB driver will implement the same interfaces from ./types and
 * replace this one through DATA_DRIVER, with no change to any caller.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type {
  Blog,
  BlogQuery,
  BlogRepo,
  Comment,
  CommentRepo,
  CommentStatus,
  DataDriver,
  NewBlog,
  Reaction,
  ReactionKind,
  ReactionRepo,
  Report,
  ReportRepo,
  SavedPost,
  SavedRepo,
  User,
  UserRepo,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");

type Collection = "blogs" | "users" | "comments" | "reactions" | "saved" | "reports";

/** In-process cache so repeated reads in one request do not hit the disk. */
const cache = new Map<Collection, unknown[]>();

function file(name: Collection) {
  return path.join(DATA_DIR, `${name}.json`);
}

function read<T>(name: Collection): T[] {
  const cached = cache.get(name);
  if (cached) return cached as T[];

  let rows: T[] = [];
  try {
    if (existsSync(file(name))) {
      const raw = readFileSync(file(name), "utf8").trim();
      if (raw) rows = JSON.parse(raw) as T[];
    }
  } catch {
    // A corrupt file must not crash the app; start that collection empty.
    rows = [];
  }
  cache.set(name, rows as unknown[]);
  return rows;
}

function write<T>(name: Collection, rows: T[]) {
  cache.set(name, rows as unknown[]);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(file(name), JSON.stringify(rows, null, 2), "utf8");
}

const now = () => new Date().toISOString();
const id = () => randomUUID();

/** Normalises a single-or-array filter into a membership test. */
function matches<T>(value: T, filter?: T | T[]) {
  if (filter === undefined) return true;
  return Array.isArray(filter) ? filter.includes(value) : value === filter;
}

/* ---------------------------------------------------------------- blogs -- */

const blogs: BlogRepo = {
  async list(query: BlogQuery = {}) {
    let rows = read<Blog>("blogs").filter(
      row =>
        matches(row.type, query.type) &&
        matches(row.status, query.status) &&
        matches(row.visibility, query.visibility) &&
        (query.category === undefined || row.category === query.category) &&
        (query.tag === undefined || row.tags.includes(query.tag)) &&
        (query.authorId === undefined || row.authorId === query.authorId) &&
        (query.noIndex === undefined || row.noIndex === query.noIndex),
    );

    if (query.search) {
      const term = query.search.toLowerCase();
      rows = rows.filter(
        row =>
          row.title.toLowerCase().includes(term) ||
          row.excerpt.toLowerCase().includes(term) ||
          row.tags.some(tag => tag.toLowerCase().includes(term)),
      );
    }

    // Newest first: published posts by publish date, everything else by update.
    rows.sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));

    const skip = query.skip ?? 0;
    return query.limit === undefined ? rows.slice(skip) : rows.slice(skip, skip + query.limit);
  },

  async count(query: BlogQuery = {}) {
    const { limit: _limit, skip: _skip, ...rest } = query;
    return (await blogs.list(rest)).length;
  },

  async findById(blogId) {
    return read<Blog>("blogs").find(row => row._id === blogId) ?? null;
  },

  async findBySlug(slug) {
    return read<Blog>("blogs").find(row => row.slug === slug) ?? null;
  },

  async create(data: NewBlog) {
    const rows = read<Blog>("blogs");
    const row: Blog = {
      ...data,
      _id: id(),
      helpfulCount: 0,
      insightfulCount: 0,
      saveCount: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    rows.push(row);
    write("blogs", rows);
    return row;
  },

  async update(blogId, patch) {
    const rows = read<Blog>("blogs");
    const index = rows.findIndex(row => row._id === blogId);
    if (index === -1) return null;
    rows[index] = { ...rows[index], ...patch, _id: blogId, updatedAt: now() };
    write("blogs", rows);
    return rows[index];
  },

  async remove(blogId) {
    const rows = read<Blog>("blogs");
    const next = rows.filter(row => row._id !== blogId);
    if (next.length === rows.length) return false;
    write("blogs", next);
    return true;
  },

  async incr(blogId, field, by) {
    const rows = read<Blog>("blogs");
    const index = rows.findIndex(row => row._id === blogId);
    if (index === -1) return;
    rows[index] = { ...rows[index], [field]: Math.max(0, rows[index][field] + by), updatedAt: now() };
    write("blogs", rows);
  },
};

/* ---------------------------------------------------------------- users -- */

const users: UserRepo = {
  async findById(userId) {
    return read<User>("users").find(row => row._id === userId) ?? null;
  },
  async findByEmail(email) {
    const target = email.toLowerCase();
    return read<User>("users").find(row => row.email.toLowerCase() === target) ?? null;
  },
  async findByUsername(username) {
    const target = username.toLowerCase();
    return read<User>("users").find(row => row.username.toLowerCase() === target) ?? null;
  },
  async list() {
    return read<User>("users");
  },
  async create(data) {
    const rows = read<User>("users");
    const row: User = { ...data, _id: id(), createdAt: now(), updatedAt: now() };
    rows.push(row);
    write("users", rows);
    return row;
  },
  async update(userId, patch) {
    const rows = read<User>("users");
    const index = rows.findIndex(row => row._id === userId);
    if (index === -1) return null;
    rows[index] = { ...rows[index], ...patch, _id: userId, updatedAt: now() };
    write("users", rows);
    return rows[index];
  },
};

/* ------------------------------------------------------------- comments -- */

const comments: CommentRepo = {
  async listByBlog(blogId, status?: CommentStatus | CommentStatus[]) {
    return read<Comment>("comments")
      .filter(row => row.blogId === blogId && matches(row.status, status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async list(status?: CommentStatus | CommentStatus[]) {
    return read<Comment>("comments")
      .filter(row => matches(row.status, status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async findById(commentId) {
    return read<Comment>("comments").find(row => row._id === commentId) ?? null;
  },
  async create(data) {
    const rows = read<Comment>("comments");
    const row: Comment = { ...data, _id: id(), createdAt: now(), updatedAt: now() };
    rows.push(row);
    write("comments", rows);
    return row;
  },
  async update(commentId, patch) {
    const rows = read<Comment>("comments");
    const index = rows.findIndex(row => row._id === commentId);
    if (index === -1) return null;
    rows[index] = { ...rows[index], ...patch, _id: commentId, updatedAt: now() };
    write("comments", rows);
    return rows[index];
  },
  async remove(commentId) {
    const rows = read<Comment>("comments");
    // Deleting a comment deletes its replies too.
    const next = rows.filter(row => row._id !== commentId && row.parentId !== commentId);
    if (next.length === rows.length) return false;
    write("comments", next);
    return true;
  },
};

/* ------------------------------------------------------------ reactions -- */

const reactions: ReactionRepo = {
  async find(userId, targetId, reaction: ReactionKind) {
    return (
      read<Reaction>("reactions").find(
        row => row.userId === userId && row.targetId === targetId && row.reaction === reaction,
      ) ?? null
    );
  },
  async listByUser(userId, targetIds) {
    return read<Reaction>("reactions").filter(
      row => row.userId === userId && (targetIds === undefined || targetIds.includes(row.targetId)),
    );
  },
  async create(data) {
    const rows = read<Reaction>("reactions");
    const row: Reaction = { ...data, _id: id(), createdAt: now() };
    rows.push(row);
    write("reactions", rows);
    return row;
  },
  async remove(reactionId) {
    const rows = read<Reaction>("reactions");
    const next = rows.filter(row => row._id !== reactionId);
    if (next.length === rows.length) return false;
    write("reactions", next);
    return true;
  },
};

/* ---------------------------------------------------------------- saved -- */

const saved: SavedRepo = {
  async find(userId, blogId) {
    return read<SavedPost>("saved").find(row => row.userId === userId && row.blogId === blogId) ?? null;
  },
  async listByUser(userId) {
    return read<SavedPost>("saved")
      .filter(row => row.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async create(data) {
    const rows = read<SavedPost>("saved");
    const row: SavedPost = { ...data, _id: id(), createdAt: now() };
    rows.push(row);
    write("saved", rows);
    return row;
  },
  async remove(savedId) {
    const rows = read<SavedPost>("saved");
    const next = rows.filter(row => row._id !== savedId);
    if (next.length === rows.length) return false;
    write("saved", next);
    return true;
  },
};

/* -------------------------------------------------------------- reports -- */

const reports: ReportRepo = {
  async list(resolved) {
    return read<Report>("reports")
      .filter(row => resolved === undefined || row.resolved === resolved)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async create(data) {
    const rows = read<Report>("reports");
    const row: Report = { ...data, _id: id(), createdAt: now() };
    rows.push(row);
    write("reports", rows);
    return row;
  },
  async update(reportId, patch) {
    const rows = read<Report>("reports");
    const index = rows.findIndex(row => row._id === reportId);
    if (index === -1) return null;
    rows[index] = { ...rows[index], ...patch, _id: reportId };
    write("reports", rows);
    return rows[index];
  },
};

export const jsonDriver: DataDriver = { blogs, users, comments, reactions, saved, reports };
