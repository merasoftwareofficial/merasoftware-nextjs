/**
 * Data layer entry point.
 *
 * Import repos from here only — never from a driver file directly. Switching
 * the whole app to MongoDB is then one environment variable:
 *
 *   DATA_DRIVER=json   local JSON files in .data/  (current)
 *   DATA_DRIVER=mongo  MongoDB through Mongoose    (after migration)
 */

import { publishedState } from "@/lib/publish-rules";
import { validArticleDocument } from "@/lib/content-rules";
import { notifyPostChange } from "@/lib/indexnow";
import { categoryNameSchema, categorySlug } from "@/lib/category-rules";
import { jsonDriver } from "./json-driver";
import { mongoDriver } from "./mongo-driver";
import type { BlogRepo, CategoryRepo, DataDriver } from "./types";

const driverName = process.env.DATA_DRIVER === "mongo" ? "mongo" : "json";

const driver: DataDriver = driverName === "mongo" ? mongoDriver : jsonDriver;

/**
 * Scheduled posts go live on the first blog read after their time.
 *
 * There is no background job: Vercel Hobby cron runs once a day at most, and a
 * post only has to be live when someone asks for it. Every read below runs this
 * first, so no page, feed or API can miss a due post. At most once a minute per
 * server instance, so a post can appear up to a minute late.
 */
const DUE_CHECK_MS = 60_000;
let lastDueCheck = 0;
let dueCheck: Promise<void> = Promise.resolve();

async function publishDuePosts() {
  const now = Date.now();
  const scheduled = await driver.blogs.list({ status: "scheduled" });
  for (const post of scheduled) {
    if (post.scheduledFor && Date.parse(post.scheduledFor) <= now) {
      // A legacy invalid draft must neither publish nor block the other due posts.
      if (!validArticleDocument(post.content)) continue;
      // The patch depends only on the post, so two instances racing here write the same thing.
      const published = await driver.blogs.update(post._id, publishedState(post, undefined, post.scheduledFor));
      notifyPostChange(post, published);
    }
  }
}

function ensureDuePublished() {
  if (Date.now() - lastDueCheck >= DUE_CHECK_MS) {
    lastDueCheck = Date.now();
    dueCheck = publishDuePosts().catch(error => {
      // A failed check must not break the page; the next read tries again.
      lastDueCheck = 0;
      console.error("[schedule] publishing due posts failed", error);
    });
  }
  return dueCheck;
}

export const blogRepo: BlogRepo = {
  ...driver.blogs,
  async list(query) {
    await ensureDuePublished();
    return driver.blogs.list(query);
  },
  async listCards(query) {
    await ensureDuePublished();
    return driver.blogs.listCards(query);
  },
  async count(query) {
    await ensureDuePublished();
    return driver.blogs.count(query);
  },
  async findById(id) {
    await ensureDuePublished();
    return driver.blogs.findById(id);
  },
  async findByIds(ids) {
    await ensureDuePublished();
    return driver.blogs.findByIds(ids);
  },
  async findBySlug(slug) {
    await ensureDuePublished();
    return driver.blogs.findBySlug(slug);
  },
  // Writes report to IndexNow here, once, so no route has to remember to.
  async create(data) {
    const created = await driver.blogs.create(data);
    notifyPostChange(null, created);
    return created;
  },
  async update(id, patch) {
    const before = await driver.blogs.findById(id);
    const updated = await driver.blogs.update(id, patch);
    notifyPostChange(before, updated);
    return updated;
  },
  async remove(id) {
    const before = await driver.blogs.findById(id);
    const removed = await driver.blogs.remove(id);
    if (removed) notifyPostChange(before, null);
    return removed;
  },
};
/**
 * The topics the member form offered before the category list existed. They
 * are part of the first list, open to members, so that form keeps its choices.
 */
const OLD_MEMBER_TOPICS = ["SEO", "Website development", "Google Ads", "Digital marketing", "Business growth"];

/**
 * Fills the category list once, on its first read, from what the site already
 * used: every category name on posts, plus OLD_MEMBER_TOPICS.
 *
 * - A category already in the list (added by hand) is left exactly as it is.
 * - Spellings of one name ("SEO", "seo") make one category, named as most posts
 *   spell it. Posts are never changed here: the other spellings, and names with
 *   odd spacing, stay under "Found only on posts" for an admin to move.
 * - Runs once per site: settings.categoriesSeeded is set afterwards, so a
 *   category an admin later deletes is not brought back. If it fails, the next
 *   read tries again; what was already created is skipped then.
 */
async function seedCategories() {
  if ((await driver.settings.get()).categoriesSeeded) return;

  const existing = await driver.categories.list();
  const taken = new Set(existing.map(category => category.slug));
  const wanted = new Map<string, { name: string; count: number; membersCanUse: boolean }>();

  for (const [name, count] of Object.entries(await driver.blogs.categoryCounts())) {
    const clean = categoryNameSchema.safeParse(name);
    if (!clean.success || clean.data !== name) continue;
    const slug = categorySlug(name);
    const current = wanted.get(slug);
    if (!taken.has(slug) && (!current || count > current.count)) wanted.set(slug, { name, count, membersCanUse: false });
  }
  for (const name of OLD_MEMBER_TOPICS) {
    const slug = categorySlug(name);
    if (taken.has(slug)) continue;
    wanted.set(slug, { name: wanted.get(slug)?.name ?? name, count: 0, membersCanUse: true });
  }

  for (const [slug, { name, membersCanUse }] of wanted) {
    try {
      await driver.categories.create({ name, slug, membersCanUse, archived: false, formerSlugs: [] });
    } catch (error) {
      // Another server instance seeding at the same moment created it first.
      if (!(error instanceof Error && error.message.includes("already exists"))) throw error;
    }
  }
  await driver.settings.update({ categoriesSeeded: true });
}

let categorySeed: Promise<void> | null = null;

function ensureCategoriesSeeded() {
  categorySeed ??= seedCategories().catch(error => {
    // A failed seed must not break the page; the next read tries again.
    categorySeed = null;
    console.error("[categories] filling the first category list failed", error);
  });
  return categorySeed;
}

export const categoryRepo: CategoryRepo = {
  ...driver.categories,
  async list() {
    await ensureCategoriesSeeded();
    return driver.categories.list();
  },
};
export const userRepo = driver.users;
export const commentRepo = driver.comments;
export const reactionRepo = driver.reactions;
export const savedRepo = driver.saved;
export const reportRepo = driver.reports;
export const settingsRepo = driver.settings;
export const mediaRepo = driver.media;
export const viewRepo = driver.views;
export const shareRepo = driver.shares;

/** Which store is active. Shown on the admin overview so the stage is never unclear. */
export const activeDriver = driverName;

export * from "./types";
