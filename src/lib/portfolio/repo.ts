import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { connectMongo } from "@/lib/mongodb";
import { PortfolioModel, PortfolioReactionModel } from "@/models/Portfolio";
import { slugify } from "@/lib/slug";
import { isPublicPortfolio, type PortfolioCapture, type PortfolioEntry, type PortfolioImage, type PortfolioReaction, type PortfolioSource } from "./types";

type ReactionRow = { entryId: string; userId: string; reaction: PortfolioReaction };
type Store = { entries: PortfolioEntry[]; reactions: ReactionRow[] };
const mongo = () => process.env.DATA_DRIVER === "mongo";
const filename = () => path.join(process.cwd(), ".data", "portfolio.json");
function read(): Store {
  if (!existsSync(filename())) return { entries: [], reactions: [] };
  // Never silently erase a corrupt store on the next write.
  return JSON.parse(readFileSync(filename(), "utf8")) as Store;
}
function write(store: Store) {
  mkdirSync(path.dirname(filename()), { recursive: true });
  const temp = `${filename()}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(store, null, 2));
  renameSync(temp, filename());
}
let initialization: Promise<unknown> | undefined;
async function ready() {
  await connectMongo();
  initialization ??= Promise.all([PortfolioModel.init(), PortfolioReactionModel.init()]).catch(error => { initialization = undefined; throw error; });
  await initialization;
}
const idle = (): PortfolioCapture => ({ status: "idle", url: "", token: "", attempts: 0, nextAttemptAt: 0, leaseUntil: 0, error: "", completedAt: "", candidates: [] });
const queued = (url: string, before = idle()): PortfolioCapture => ({ ...before, status: "queued", url, token: randomUUID(), attempts: 0, nextAttemptAt: Date.now(), leaseUntil: 0, error: "" });
const sorted = (entries: PortfolioEntry[]) => entries.sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt));

export const portfolioRepo = {
  async list(publicOnly = false): Promise<PortfolioEntry[]> {
    let entries: PortfolioEntry[];
    if (mongo()) { await ready(); entries = await PortfolioModel.find(publicOnly ? { status: "published", "source.available": true, "source.linkedProjectId": "" } : {}).lean() as unknown as PortfolioEntry[]; }
    else entries = read().entries;
    return sorted(publicOnly ? entries.filter(isPublicPortfolio) : entries);
  },
  async find(id: string): Promise<PortfolioEntry | null> {
    if (mongo()) { await ready(); return await PortfolioModel.findById(id).lean() as unknown as PortfolioEntry | null; }
    return read().entries.find(row => row._id === id) ?? null;
  },
  async findBySlug(slug: string): Promise<PortfolioEntry | null> {
    if (mongo()) { await ready(); return await PortfolioModel.findOne({ slug }).lean() as unknown as PortfolioEntry | null; }
    return read().entries.find(row => row.slug === slug) ?? null;
  },
  async sync(source: PortfolioSource): Promise<boolean> {
    const now = new Date().toISOString();
    const before = await this.find(source.id);
    if (before && before.source.revision >= source.revision) return false;
    const captureChanged = !before || source.url !== before.source.url || source.captureAllowed !== before.source.captureAllowed || source.available !== before.source.available;
    const capture = captureChanged
      ? source.available && source.captureAllowed && source.url && source.type === "project"
        ? queued(source.url, before?.capture)
        : { ...(before?.capture ?? idle()), status: "idle" as const, token: randomUUID(), leaseUntil: 0 }
      : before!.capture;
    const patch: Partial<PortfolioEntry> = { source, syncedAt: now };
    if (captureChanged) patch.capture = capture;
    if (!source.available || source.linkedProjectId) { patch.status = "hidden"; patch.updatedAt = now; }
    if (!before) {
      const row: PortfolioEntry = {
        _id: source.id, source, title: source.name || "Untitled project",
        slug: `${(slugify(source.name) || "project").slice(0, 145)}-${source.id}`,
        brand: "", category: source.category, summary: "", problem: "", solution: "", result: "",
        services: [], liveUrl: "", cover: null, gallery: [], status: "draft", featured: false,
        sortOrder: 0, capture, createdAt: now, updatedAt: now, syncedAt: now,
      };
      if (!source.available || source.linkedProjectId) row.status = "hidden";
      if (mongo()) {
        await ready();
        await PortfolioModel.updateOne({ _id: source.id }, { $setOnInsert: row }, { upsert: true });
        // If another instance inserted a newer revision, its compare-and-set wins.
        await PortfolioModel.updateOne({ _id: source.id, "source.revision": { $lt: source.revision } }, { $set: patch });
      } else { const store = read(); const existing = store.entries.find(entry => entry._id === source.id); if (!existing) store.entries.push(row); else if (existing.source.revision < source.revision) Object.assign(existing, patch); write(store); }
    } else if (mongo()) {
      await ready();
      await PortfolioModel.updateOne({ _id: source.id, "source.revision": before.source.revision }, { $set: patch });
    } else {
      const store = read(); const row = store.entries.find(entry => entry._id === source.id);
      if (row && row.source.revision < source.revision) Object.assign(row, patch);
      write(store);
    }
    const stored = await this.find(source.id);
    if (stored && stored.source.revision < source.revision) return this.sync(source);
    return true;
  },
  async update(id: string, patch: Partial<PortfolioEntry>): Promise<PortfolioEntry | null> {
    const changes = { ...patch, updatedAt: new Date().toISOString() };
    if (mongo()) {
      await ready();
      const filter = patch.status === "published" ? { _id: id, "source.available": true, "source.linkedProjectId": "" } : { _id: id };
      return await PortfolioModel.findOneAndUpdate(filter, { $set: changes }, { returnDocument: "after" }).lean() as unknown as PortfolioEntry | null;
    }
    const store = read(); const row = store.entries.find(entry => entry._id === id);
    if (!row || (patch.status === "published" && (!row.source.available || row.source.linkedProjectId))) return null;
    if (patch.slug && store.entries.some(entry => entry._id !== id && entry.slug === patch.slug)) throw new Error("That portfolio slug is already used.");
    Object.assign(row, changes); write(store); return row;
  },
  async queueCapture(id: string, url: string): Promise<PortfolioEntry | null> {
    const row = await this.find(id);
    if (!row?.source.available) throw new Error("Source project is unavailable.");
    return this.update(id, { capture: queued(url, row.capture) });
  },
  async claimCapture(): Promise<PortfolioEntry | null> {
    const now = Date.now();
    const claim = (row: PortfolioEntry) => row.source.available && ((row.capture.status === "queued" && row.capture.nextAttemptAt <= now) || (row.capture.status === "running" && row.capture.leaseUntil < now));
    if (mongo()) {
      await ready();
      await PortfolioModel.updateMany({ "capture.status": "running", "capture.leaseUntil": { $lt: now }, "capture.attempts": { $gte: 3 } }, { $set: { "capture.status": "failed", "capture.error": "Capture worker timed out repeatedly. Retry or upload images manually.", "capture.leaseUntil": 0 } });
      // Each claim gets a fresh token: a timed-out worker cannot finish the next worker's job.
      return await PortfolioModel.findOneAndUpdate({ "source.available": true, $or: [
        { "capture.status": "queued", "capture.nextAttemptAt": { $lte: now } },
        { "capture.status": "running", "capture.leaseUntil": { $lt: now } },
      ] }, { $set: { "capture.status": "running", "capture.token": randomUUID(), "capture.leaseUntil": now + 240_000 }, $inc: { "capture.attempts": 1 } }, { returnDocument: "after", sort: { "capture.nextAttemptAt": 1 } }).lean() as unknown as PortfolioEntry | null;
    }
    const store = read();
    for (const entry of store.entries) {
      if (entry.capture.status === "running" && entry.capture.leaseUntil < now && entry.capture.attempts >= 3) entry.capture = { ...entry.capture, status: "failed", error: "Capture worker timed out repeatedly. Retry or upload images manually.", leaseUntil: 0 };
    }
    write(store);
    const row = store.entries.find(claim);
    if (!row) return null;
    row.capture = { ...row.capture, status: "running", token: randomUUID(), attempts: row.capture.attempts + 1, leaseUntil: now + 240_000 };
    write(store); return row;
  },
  async finishCapture(id: string, token: string, images: PortfolioImage[], error = ""): Promise<boolean> {
    const before = await this.find(id);
    if (!before || before.capture.token !== token || before.capture.status !== "running" || before.capture.leaseUntil < Date.now()) return false;
    const capture: PortfolioCapture = error ? {
      ...before.capture, status: before.capture.attempts < 3 ? "queued" : "failed",
      error, nextAttemptAt: Date.now() + before.capture.attempts * 60_000, leaseUntil: 0,
    } : { ...before.capture, status: "ready", candidates: images, error: "", completedAt: new Date().toISOString(), leaseUntil: 0 };
    if (mongo()) {
      await ready();
      const result = await PortfolioModel.updateOne({ _id: id, "capture.token": token, "capture.status": "running", "capture.leaseUntil": { $gte: Date.now() } }, { $set: { capture } });
      return result.modifiedCount > 0;
    }
    const store = read(); const row = store.entries.find(entry => entry._id === id);
    if (!row || row.capture.token !== token || row.capture.status !== "running") return false;
    row.capture = capture; write(store); return true;
  },
  async reactions(id: string, userId?: string): Promise<{ counts: Record<PortfolioReaction, number>; mine: PortfolioReaction[] }> {
    let rows: ReactionRow[];
    if (mongo()) {
      await ready();
      const [counts, mine] = await Promise.all([
        PortfolioReactionModel.aggregate([{ $match: { entryId: id } }, { $group: { _id: "$reaction", count: { $sum: 1 } } }]),
        userId ? PortfolioReactionModel.find({ entryId: id, userId }).lean() : Promise.resolve([]),
      ]);
      return { counts: { like: counts.find(row => row._id === "like")?.count ?? 0, impressive: counts.find(row => row._id === "impressive")?.count ?? 0 }, mine: mine.map(row => row.reaction as PortfolioReaction) };
    } else rows = read().reactions.filter(row => row.entryId === id);
    return { counts: { like: rows.filter(row => row.reaction === "like").length, impressive: rows.filter(row => row.reaction === "impressive").length }, mine: rows.filter(row => row.userId === userId).map(row => row.reaction) };
  },
  async setReaction(id: string, userId: string, reaction: PortfolioReaction, active: boolean) {
    const key = { entryId: id, userId, reaction };
    if (mongo()) {
      await ready();
      if (active) {
        try { await PortfolioReactionModel.updateOne(key, { $setOnInsert: key }, { upsert: true }); }
        catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
      } else await PortfolioReactionModel.deleteOne(key);
    } else {
      const store = read(); store.reactions = store.reactions.filter(row => !(row.entryId === id && row.userId === userId && row.reaction === reaction));
      if (active) store.reactions.push(key); write(store);
    }
    return this.reactions(id, userId);
  },
};
