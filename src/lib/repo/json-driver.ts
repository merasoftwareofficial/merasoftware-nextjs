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
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DEFAULT_HOMEPAGE_CONTENT } from "@/lib/homepage-content";
import type {
  Blog,
  BlogQuery,
  BlogRepo,
  Category,
  CategoryRepo,
  ClickPlacement,
  ClickRepo,
  Comment,
  CommentRepo,
  CommentStatus,
  DataDriver,
  MediaAsset,
  NewBlog,
  Reaction,
  ReactionKind,
  ReactionRepo,
  Report,
  ReportRepo,
  SavedPost,
  SavedRepo,
  Settings,
  SettingsRepo,
  SharePlatform,
  ShareRepo,
  User,
  UserRepo,
  ViewRepo,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");

type Collection = "blogs" | "categories" | "users" | "comments" | "reactions" | "saved" | "reports" | "settings" | "media" | "viewSeen" | "viewDays" | "shareDays" | "clickDays";

/**
 * In-process cache so repeated reads in one request do not hit the disk.
 *
 * Validated against the file's modified time on every read. Next.js loads this
 * module more than once in one server — a route handler and a server component
 * do not share an instance — so a write in one instance leaves the others
 * holding stale rows. Without the mtime check a member could not see the post
 * they had just submitted, and a moderator's approval never reached the page.
 */
const cache = new Map<Collection, { rows: unknown[]; mtimeMs: number }>();

function file(name: Collection) {
  return path.join(DATA_DIR, `${name}.json`);
}

/** The file's modified time, or 0 when it does not exist yet. */
function stamp(name: Collection): number {
  try {
    return existsSync(file(name)) ? statSync(file(name)).mtimeMs : 0;
  } catch {
    return 0;
  }
}

function read<T>(name: Collection): T[] {
  const mtimeMs = stamp(name);
  const cached = cache.get(name);
  if (cached && cached.mtimeMs === mtimeMs) return cached.rows as T[];

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
  cache.set(name, { rows: rows as unknown[], mtimeMs });
  return rows;
}

function write<T>(name: Collection, rows: T[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(file(name), JSON.stringify(rows, null, 2), "utf8");
  // Stamp with the time the file now carries, so this instance's cache stays
  // valid and other instances see a changed mtime and re-read.
  cache.set(name, { rows: rows as unknown[], mtimeMs: stamp(name) });
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

  async listCards(query: BlogQuery = {}) {
    return (await blogs.list(query)).map(({ content: _content, ...card }) => card);
  },

  async count(query: BlogQuery = {}) {
    const { limit: _limit, skip: _skip, ...rest } = query;
    return (await blogs.list(rest)).length;
  },

  async findById(blogId) {
    return read<Blog>("blogs").find(row => row._id === blogId) ?? null;
  },

  async findByIds(blogIds) {
    const wanted = new Set(blogIds);
    return read<Blog>("blogs").filter(row => wanted.has(row._id));
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
      viewCount: 0,
      shareCount: 0,
      clickCount: 0,
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
    if (index === -1) return null;
    // Not updatedAt: a reaction or save is not an edit, and updatedAt is the
    // article's dateModified for search engines and the sitemap.
    const value = Math.max(0, rows[index][field] + by);
    rows[index] = { ...rows[index], [field]: value };
    write("blogs", rows);
    return value;
  },

  async renameCategory(from, to) {
    const rows = read<Blog>("blogs");
    let moved = 0;
    // Not updatedAt: the category's name changed, not the article.
    const next = rows.map(row => (row.category === from ? (moved++, { ...row, category: to }) : row));
    if (moved) write("blogs", next);
    return moved;
  },

  async categoryCounts() {
    const counts: Record<string, number> = {};
    for (const row of read<Blog>("blogs")) {
      if (row.category) counts[row.category] = (counts[row.category] ?? 0) + 1;
    }
    return counts;
  },
};

/* ----------------------------------------------------------- categories -- */

const categories: CategoryRepo = {
  async list() {
    return [...read<Category>("categories")].sort((a, b) => a.name.localeCompare(b.name));
  },
  async findById(categoryId) {
    return read<Category>("categories").find(row => row._id === categoryId) ?? null;
  },
  async create(data) {
    const rows = read<Category>("categories");
    // The same guard as the MongoDB unique index on slug.
    if (rows.some(row => row.slug === data.slug)) throw new Error("A category with that name already exists.");
    const row: Category = { ...data, _id: id(), createdAt: now(), updatedAt: now() };
    rows.push(row);
    write("categories", rows);
    return row;
  },
  async update(categoryId, patch) {
    const rows = read<Category>("categories");
    const index = rows.findIndex(row => row._id === categoryId);
    if (index === -1) return null;
    if (patch.slug && rows.some(row => row._id !== categoryId && row.slug === patch.slug)) {
      throw new Error("A category with that name already exists.");
    }
    rows[index] = { ...rows[index], ...patch, _id: categoryId, updatedAt: now() };
    write("categories", rows);
    return rows[index];
  },
  async remove(categoryId) {
    const rows = read<Category>("categories");
    const next = rows.filter(row => row._id !== categoryId);
    if (next.length === rows.length) return false;
    write("categories", next);
    return true;
  },
};

/* ---------------------------------------------------------------- users -- */

const users: UserRepo = {
  async findById(userId) {
    return read<User>("users").find(row => row._id === userId) ?? null;
  },
  async findByIds(userIds) {
    const wanted = new Set(userIds);
    return read<User>("users").filter(row => wanted.has(row._id));
  },
  async findByEmail(email) {
    const target = email.toLowerCase();
    return read<User>("users").find(row => row.email.toLowerCase() === target) ?? null;
  },
  async findByUsername(username) {
    const target = username.toLowerCase();
    return read<User>("users").find(row => row.username.toLowerCase() === target) ?? null;
  },
  async findByPortalUserId(portalUserId) {
    return read<User>("users").find(row => row.portalUserId === portalUserId) ?? null;
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

/* ------------------------------------------------------------- settings -- */

/**
 * Site settings are one row in a collection file, so they use the same cache
 * and mtime revalidation as everything else. Missing keys fall back to these
 * defaults, which is also what a fresh checkout with no .data reads.
 */
const SETTINGS_DEFAULTS: Omit<Settings, "updatedAt"> = {
  _id: "site",
  commentDefault: "visible",
  commentsEnabled: true,
  viewsPublic: false,
  shareEnabled: true,
  sharePlatforms: ["whatsapp", "facebook", "x", "linkedin", "telegram", "email", "copy"],
  categoriesSeeded: false,
};

const settings: SettingsRepo = {
  async get() {
    const row = read<Settings>("settings").find(item => item._id === "site");
    return { ...SETTINGS_DEFAULTS, updatedAt: now(), ...row };
  },
  async update(patch) {
    const current = await settings.get();
    const row: Settings = { ...current, ...patch, _id: "site", updatedAt: now() };
    write("settings", [row]);
    return row;
  },
  async updateHomepageSection(section, content, images) {
    const current = await settings.get();
    const nextImages = { ...current.homepageImages };
    for (const slot of Object.keys(images) as (keyof typeof nextImages)[]) {
      const image = images[slot];
      if (image === null) delete nextImages[slot];
      else if (image) nextImages[slot] = image;
    }
    const row: Settings = {
      ...current,
      homepageContent: { ...(current.homepageContent ?? DEFAULT_HOMEPAGE_CONTENT), [section]: content },
      homepageImages: nextImages,
      updatedAt: now(),
    };
    write("settings", [row]);
    return row;
  },
};

const media: DataDriver["media"] = {
  async list() {
    return read<MediaAsset>("media").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async findByIds(ids) {
    const wanted = new Set(ids);
    return read<MediaAsset>("media").filter(asset => wanted.has(asset._id));
  },
  async findByChecksum(sha256) {
    return read<MediaAsset>("media").find(asset => asset.sha256 === sha256) ?? null;
  },
  async create(data) {
    const rows = read<MediaAsset>("media");
    if (rows.some(asset => asset.publicId === data.publicId)) throw new Error("This image is already in the media library.");
    if (rows.some(asset => asset.sha256 === data.sha256)) throw new Error("An identical image is already in the media library.");
    const stamp = now();
    const row: MediaAsset = { ...data, _id: id(), createdAt: stamp, updatedAt: stamp };
    rows.push(row);
    write("media", rows);
    return row;
  },
};

/* ---------------------------------------------------------------- views -- */

const SEEN_FOR_MS = 24 * 60 * 60 * 1000;

type SeenRow = { _id: string; at: string };
type DayRow = { _id: string; blogId: string; day: string; count: number };

/**
 * Claim a visitor key for 24 hours; false when it is already held. Expired keys
 * are dropped on every write, standing in for MongoDB's TTL index. Views and
 * shares both claim here; their keys never collide (share-rules.ts).
 */
function claimKey(visitorKey: string) {
  const cutoff = Date.now() - SEEN_FOR_MS;
  const seen = read<SeenRow>("viewSeen").filter(row => Date.parse(row.at) > cutoff);
  if (seen.some(row => row._id === visitorKey)) return false;
  write("viewSeen", [...seen, { _id: visitorKey, at: now() }]);
  return true;
}

const views: ViewRepo = {
  async record(blogId, visitorKey, day) {
    if (!claimKey(visitorKey)) return false;

    const days = read<DayRow>("viewDays");
    const index = days.findIndex(row => row.blogId === blogId && row.day === day);
    if (index === -1) days.push({ _id: id(), blogId, day, count: 1 });
    else days[index] = { ...days[index], count: days[index].count + 1 };
    write("viewDays", days);

    // Not incr(): a view must leave updatedAt alone.
    const rows = read<Blog>("blogs");
    const blogIndex = rows.findIndex(row => row._id === blogId);
    if (blogIndex !== -1) {
      rows[blogIndex] = { ...rows[blogIndex], viewCount: (rows[blogIndex].viewCount ?? 0) + 1 };
      write("blogs", rows);
    }
    return true;
  },

  async sumSince(day, blogIds) {
    const totals: Record<string, number> = {};
    for (const row of read<DayRow>("viewDays")) {
      if (row.day < day || (blogIds && !blogIds.includes(row.blogId))) continue;
      totals[row.blogId] = (totals[row.blogId] ?? 0) + row.count;
    }
    return totals;
  },
};

/* --------------------------------------------------------------- shares -- */

type ShareDayRow = DayRow & { platform: SharePlatform };

const shares: ShareRepo = {
  async record(blogId, platform, visitorKey, day) {
    if (!claimKey(visitorKey)) return false;

    const days = read<ShareDayRow>("shareDays");
    const index = days.findIndex(row => row.blogId === blogId && row.day === day && row.platform === platform);
    if (index === -1) days.push({ _id: id(), blogId, day, platform, count: 1 });
    else days[index] = { ...days[index], count: days[index].count + 1 };
    write("shareDays", days);

    // Not incr(): a share must leave updatedAt alone.
    const rows = read<Blog>("blogs");
    const blogIndex = rows.findIndex(row => row._id === blogId);
    if (blogIndex !== -1) {
      rows[blogIndex] = { ...rows[blogIndex], shareCount: (rows[blogIndex].shareCount ?? 0) + 1 };
      write("blogs", rows);
    }
    return true;
  },

  async sumSince(day, blogIds) {
    const totals: Record<string, number> = {};
    for (const row of read<ShareDayRow>("shareDays")) {
      if (row.day < day || (blogIds && !blogIds.includes(row.blogId))) continue;
      totals[row.blogId] = (totals[row.blogId] ?? 0) + row.count;
    }
    return totals;
  },

  async byPlatform(blogIds) {
    const result: Record<string, Partial<Record<SharePlatform, number>>> = {};
    for (const row of read<ShareDayRow>("shareDays")) {
      if (blogIds && !blogIds.includes(row.blogId)) continue;
      const post = (result[row.blogId] ??= {});
      post[row.platform] = (post[row.platform] ?? 0) + row.count;
    }
    return result;
  },
};

/* --------------------------------------------------------------- clicks -- */

type ClickDayRow = DayRow & { placement: ClickPlacement };

const clicks: ClickRepo = {
  async record(blogId, placement, visitorKey, day) {
    if (!claimKey(visitorKey)) return false;

    const days = read<ClickDayRow>("clickDays");
    const index = days.findIndex(row => row.blogId === blogId && row.day === day && row.placement === placement);
    if (index === -1) days.push({ _id: id(), blogId, day, placement, count: 1 });
    else days[index] = { ...days[index], count: days[index].count + 1 };
    write("clickDays", days);

    // Not incr(): a click must leave updatedAt alone.
    const rows = read<Blog>("blogs");
    const blogIndex = rows.findIndex(row => row._id === blogId);
    if (blogIndex !== -1) {
      rows[blogIndex] = { ...rows[blogIndex], clickCount: (rows[blogIndex].clickCount ?? 0) + 1 };
      write("blogs", rows);
    }
    return true;
  },

  async sumSince(day, blogIds) {
    const totals: Record<string, number> = {};
    for (const row of read<ClickDayRow>("clickDays")) {
      if (row.day < day || (blogIds && !blogIds.includes(row.blogId))) continue;
      totals[row.blogId] = (totals[row.blogId] ?? 0) + row.count;
    }
    return totals;
  },

  async byPlacement(blogIds) {
    const result: Record<string, Partial<Record<ClickPlacement, number>>> = {};
    for (const row of read<ClickDayRow>("clickDays")) {
      if (blogIds && !blogIds.includes(row.blogId)) continue;
      const post = (result[row.blogId] ??= {});
      post[row.placement] = (post[row.placement] ?? 0) + row.count;
    }
    return result;
  },
};

export const jsonDriver: DataDriver = { blogs, categories, users, comments, reactions, saved, reports, settings, media, views, shares, clicks };
