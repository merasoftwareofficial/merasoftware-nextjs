/**
 * Data layer contract.
 *
 * Every API route talks to these interfaces only — never to a driver directly.
 * Swapping the JSON driver for the MongoDB driver must not change any caller.
 * Field names mirror src/models/Blog.ts so the future migration needs no mapping.
 */

export type BlogType = "official" | "community" | "discussion";
export type Visibility = "public" | "members" | "private" | "unlisted";
export type BlogStatus = "draft" | "pending" | "published" | "scheduled" | "rejected" | "archived";
export type Role = "visitor" | "member" | "moderator" | "editor" | "admin";
export type ReactionKind = "helpful" | "insightful";
export type CommentStatus = "visible" | "hidden" | "pending";
/**
 * How a post handles comments.
 *
 * `default` defers to the site setting, so changing the site setting moves
 * every post that never chose for itself. The other three are a deliberate
 * per-post decision an editor made and the site setting must not override.
 */
export type CommentMode = "default" | "open" | "moderated" | "closed";
/** Whether readers see a post's view count. `default` follows the site setting. */
export type ViewMode = "default" | "show" | "hide";
/** Whether a post shows its share buttons. `default` follows the site setting. */
export type ShareMode = "default" | "show" | "hide";
/**
 * Where a share went. Every one but `native` is a button an admin can turn on
 * or off; `native` is the phone's own share sheet, offered whenever sharing is.
 */
/**
 * How big a post's title shows on its page. The title is always the page's one
 * <h1>; this only changes its size: `large` (the default) or `medium`, the size
 * of a section heading, for a long title.
 */
export type TitleSize = "large" | "medium";
export type SharePlatform = "whatsapp" | "facebook" | "x" | "linkedin" | "telegram" | "email" | "copy" | "native";
/**
 * What a counted click was (click-rules.ts): a related post opened from the
 * bottom of an article, or the "Next page" button of a long article.
 */
export type ClickPlacement = "related" | "next-page";

export interface FeaturedImage {
  url: string;
  publicId: string;
  alt: string;
}

export interface MediaAsset {
  _id: string;
  sha256: string;
  url: string;
  publicId: string;
  assetId: string;
  assetFolder: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  altText: string;
  createdAt: string;
  updatedAt: string;
}

export type HomeImageSlot = "hero" | "work-northstar" | "work-oasis";

export interface HomepageImage {
  assetId: string;
  alt: string;
  focalX: number;
  focalY: number;
}

/** Editable copy for the existing homepage layout. Keep styling in the page. */
export interface HomepageContent {
  hero: { eyebrow: string; headingBefore: string; headingEmphasis: string; headingAfter: string; description: string; primaryLabel: string; primaryHref: string; secondaryLabel: string; secondaryHref: string; signalLabel: string; signalPrimary: string; signalSecondary: string };
  marquee: string[];
  services: { eyebrow: string; sideNote: string; headingBefore: string; headingEmphasis: string; headingAfter: string; items: { slug: string; title: string; description: string }[] };
  pointOfView: { eyebrow: string; headingLineOne: string; headingBefore: string; headingEmphasis: string; headingAfter: string; description: string };
  work: { eyebrow: string; allLabel: string; headingBefore: string; headingEmphasis: string; headingAfter: string; cards: { tag: string; titleLineOne: string; titleLineTwo: string; description: string }[] };
  insights: { eyebrow: string; allLabel: string; headingBefore: string; headingEmphasis: string; headingAfter: string; fallbackLineOne: string; fallbackLineTwo: string };
  contact: { eyebrow: string; headingLineOne: string; headingEmphasis: string; buttonLabel: string; buttonHref: string };
}

export type HomepageSection = keyof HomepageContent;

export interface Seo {
  title: string;
  description: string;
  canonical: string;
}

/** One question and answer shown at the end of a post, with FAQPage data (structured-data.ts). */
export interface BlogFaq {
  question: string;
  answer: string;
}

export interface Blog {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  /** Tiptap JSON document. Kept as unknown so the layer stays editor-agnostic. */
  content: unknown;
  authorId: string;
  authorName: string;
  type: BlogType;
  visibility: Visibility;
  status: BlogStatus;
  category?: string;
  tags: string[];
  featuredImage?: FeaturedImage;
  seo?: Seo;
  publishedAt?: string;
  scheduledFor?: string;
  noIndex: boolean;
  helpfulCount: number;
  insightfulCount: number;
  saveCount: number;
  /** Moderator note shown to the author on reject / request-changes. */
  reviewNote?: string;
  /** Per-post comment control. Absent or "default" follows the site setting. */
  comments?: CommentMode;
  /** Counted views (view-rules.ts). Absent on posts created before view counting. */
  viewCount?: number;
  /** Per-post control of the public view count. Absent or "default" follows the site setting. */
  showViews?: ViewMode;
  /** Counted share clicks (share-rules.ts). Admin only; never sent to readers. */
  shareCount?: number;
  /** Per-post control of the share buttons. Absent or "default" follows the site setting. */
  sharing?: ShareMode;
  /** Title size on the post's page. Absent means "large". */
  titleSize?: TitleSize;
  /** Questions and answers shown after the article. Absent on older posts. */
  faqs?: BlogFaq[];
  /** Counted clicks on this post's related posts and page buttons (click-rules.ts). Admin only. */
  clickCount?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A blog category an admin manages at /admin/categories (category-rules.ts).
 *
 * A post stores the category's name in Blog.category, so every page that shows
 * it keeps reading one string; a rename rewrites that string on every post.
 */
export interface Category {
  _id: string;
  name: string;
  /** topicSlug(name): the /topics address. Unique, so "SEO" and "seo" cannot both exist. */
  slug: string;
  /** Offered on the member form; official posts may use every active category. */
  membersCanUse: boolean;
  /** Kept on the posts that have it, but no longer offered for new choices. */
  archived: boolean;
  /** Addresses this category had before a rename or merge; they redirect to it. */
  formerSlugs: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A post without its body, for lists. The Tiptap document is the heaviest
 * field and no list shows it, so listCards() leaves it in the database.
 */
export type BlogCard = Omit<Blog, "content">;

export interface User {
  _id: string;
  email: string;
  username: string;
  displayName: string;
  role: Role;
  bio?: string;
  banned: boolean;
  /** The client portal's user `_id` this website profile belongs to. */
  portalUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Where an address stands; only `active` is ever mailed (src/docs/NOTIFICATIONS.md). */
export type EmailStatus = "none" | "pending" | "active" | "unsubscribed" | "bounced";

/**
 * One person's notification choices — the single record every channel reads
 * (src/lib/notify-rules.ts). `email` and `userId` are left out, never null:
 * both carry unique indexes that skip only missing values.
 */
export interface Subscriber {
  _id: string;
  email?: string;
  emailStatus: EmailStatus;
  emailConfirmedAt?: string;
  /** When the last confirm or manage-link mail went out; limits them to one per 10 minutes. */
  confirmSentAt?: string;
  userId?: string;
  /** The signed-in user who asked for this email; linked as userId when the confirm link is clicked. */
  pendingUserId?: string;
  /** Secret for the manage, confirm and unsubscribe links. */
  token: string;
  /** Category _ids, not names: a rename rewrites the name on posts but keeps the id. */
  categories: string[];
  offers: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One browser or phone that allowed notifications; its owner's choices live on the Subscriber. */
export interface PushDevice {
  _id: string;
  subscriberId: string;
  /** The push service address; unique per browser, and secret enough to identify it. */
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export type NotifyChannel = "push" | "email";
export type NotifyJobStatus = "queued" | "running" | "done" | "skipped";

/** One announcement on one channel, worked through by src/lib/notify-queue.ts. */
export interface NotifyJob {
  _id: string;
  kind: "post";
  /** The post's _id. */
  refId: string;
  channel: NotifyChannel;
  status: NotifyJobStatus;
  /** While running: another runner may take the job over after this time. */
  lockedUntil?: string;
  sent: number;
  failed: number;
  /** Why it was skipped, for the panel. */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  _id: string;
  blogId: string;
  parentId?: string;
  userId: string;
  userName: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Reaction {
  _id: string;
  userId: string;
  targetId: string;
  reaction: ReactionKind;
  createdAt: string;
}

export interface SavedPost {
  _id: string;
  userId: string;
  blogId: string;
  createdAt: string;
}

export interface Report {
  _id: string;
  targetType: "blog" | "comment";
  targetId: string;
  userId: string;
  reason: string;
  resolved: boolean;
  createdAt: string;
}

/** Filters accepted by blogRepo.list(). All optional; omitted keys are not filtered. */
export interface BlogQuery {
  type?: BlogType | BlogType[];
  status?: BlogStatus | BlogStatus[];
  visibility?: Visibility | Visibility[];
  category?: string;
  tag?: string;
  authorId?: string;
  noIndex?: boolean;
  search?: string;
  limit?: number;
  skip?: number;
}

export type NewBlog = Omit<
  Blog,
  "_id" | "createdAt" | "updatedAt" | "helpfulCount" | "insightfulCount" | "saveCount" | "viewCount" | "shareCount" | "clickCount"
>;

export interface BlogRepo {
  list(query?: BlogQuery): Promise<Blog[]>;
  /** Same filters and order as list(), without each post's content. */
  listCards(query?: BlogQuery): Promise<BlogCard[]>;
  count(query?: BlogQuery): Promise<number>;
  findById(id: string): Promise<Blog | null>;
  /** The posts that exist among these ids, in one read. Order is not guaranteed. */
  findByIds(ids: string[]): Promise<Blog[]>;
  findBySlug(slug: string): Promise<Blog | null>;
  create(data: NewBlog): Promise<Blog>;
  update(id: string, patch: Partial<Blog>): Promise<Blog | null>;
  remove(id: string): Promise<boolean>;
  /**
   * Atomic counter change used by reactions and saves. Leaves updatedAt alone.
   * Returns the counter's new value, or null when the post does not exist.
   */
  incr(id: string, field: "helpfulCount" | "insightfulCount" | "saveCount", by: number): Promise<number | null>;
  /**
   * Moves every post filed under `from` to `to`, in any status. Leaves
   * updatedAt alone: the category's name changed, not the article. Returns how
   * many posts moved.
   */
  renameCategory(from: string, to: string): Promise<number>;
  /** How many posts, in any status, carry each category name. */
  categoryCounts(): Promise<Record<string, number>>;
}

export interface CategoryRepo {
  /** Every category, archived ones too, by name. */
  list(): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  create(data: Omit<Category, "_id" | "createdAt" | "updatedAt">): Promise<Category>;
  update(id: string, patch: Partial<Omit<Category, "_id" | "createdAt" | "updatedAt">>): Promise<Category | null>;
  remove(id: string): Promise<boolean>;
}

export interface UserRepo {
  findById(id: string): Promise<User | null>;
  /** The users that exist among these ids, in one read. Order is not guaranteed. */
  findByIds(ids: string[]): Promise<User[]>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByPortalUserId(portalUserId: string): Promise<User | null>;
  list(): Promise<User[]>;
  create(data: Omit<User, "_id" | "createdAt" | "updatedAt">): Promise<User>;
  update(id: string, patch: Partial<User>): Promise<User | null>;
}

export interface SubscriberRepo {
  findById(id: string): Promise<Subscriber | null>;
  findByEmail(email: string): Promise<Subscriber | null>;
  findByUserId(userId: string): Promise<Subscriber | null>;
  findByToken(token: string): Promise<Subscriber | null>;
  create(data: Omit<Subscriber, "_id" | "createdAt" | "updatedAt">): Promise<Subscriber>;
  /** A key set to undefined is removed. */
  update(id: string, patch: Partial<Omit<Subscriber, "_id" | "createdAt" | "updatedAt">>): Promise<Subscriber | null>;
  remove(id: string): Promise<boolean>;
  /** A category merge: every subscriber of `fromId` follows `toId` instead. Returns how many changed. */
  replaceCategory(fromId: string, toId: string): Promise<number>;
  /** A category delete: drops the id from every subscriber. Returns how many changed. */
  removeCategory(id: string): Promise<number>;
  /** Everyone following this category id. */
  listByCategory(categoryId: string): Promise<Subscriber[]>;
}

export interface PushDeviceRepo {
  /** Saves a device by its endpoint; a browser that subscribes again moves to the new owner. */
  upsert(data: Omit<PushDevice, "_id" | "createdAt" | "updatedAt">): Promise<PushDevice>;
  findByEndpoint(endpoint: string): Promise<PushDevice | null>;
  listBySubscribers(subscriberIds: string[]): Promise<PushDevice[]>;
  removeByEndpoint(endpoint: string): Promise<boolean>;
  /** Two settings records became one: the devices follow. */
  moveSubscriber(fromId: string, toId: string): Promise<number>;
}

export interface NotifyJobRepo {
  /** Null when this announcement already has a job on this channel. */
  create(data: Pick<NotifyJob, "kind" | "refId" | "channel">): Promise<NotifyJob | null>;
  /** Jobs not finished yet, oldest first. */
  listOpen(limit: number): Promise<NotifyJob[]>;
  /** Takes a queued job, or a running one whose lock ran out. Null when another runner has it. */
  claim(id: string, lockedUntil: string): Promise<NotifyJob | null>;
  finish(id: string, patch: Pick<NotifyJob, "status" | "sent" | "failed"> & { note?: string }): Promise<void>;
  /** Puts a claimed job back, e.g. when its channel is not configured yet. */
  release(id: string): Promise<void>;
}

export interface DeliveryRepo {
  /** True the first time a key is claimed: one key = one message, ever (kept 90 days). */
  claim(key: string): Promise<boolean>;
}

export interface CommentRepo {
  listByBlog(blogId: string, status?: CommentStatus | CommentStatus[]): Promise<Comment[]>;
  list(status?: CommentStatus | CommentStatus[]): Promise<Comment[]>;
  findById(id: string): Promise<Comment | null>;
  create(data: Omit<Comment, "_id" | "createdAt" | "updatedAt">): Promise<Comment>;
  update(id: string, patch: Partial<Comment>): Promise<Comment | null>;
  remove(id: string): Promise<boolean>;
}

export interface ReactionRepo {
  find(userId: string, targetId: string, reaction: ReactionKind): Promise<Reaction | null>;
  listByUser(userId: string, targetIds?: string[]): Promise<Reaction[]>;
  create(data: Omit<Reaction, "_id" | "createdAt">): Promise<Reaction>;
  remove(id: string): Promise<boolean>;
}

export interface SavedRepo {
  find(userId: string, blogId: string): Promise<SavedPost | null>;
  listByUser(userId: string): Promise<SavedPost[]>;
  create(data: Omit<SavedPost, "_id" | "createdAt">): Promise<SavedPost>;
  remove(id: string): Promise<boolean>;
}

/**
 * Blog view counting. A visitor key is a keyed hash made in view-rules.ts and
 * kept for 24 hours only, so one visitor counts once per post per 24 hours.
 * Counting never touches the post's updatedAt.
 */
export interface ViewRepo {
  /** Counts one view unless this key was seen for the post in the last 24 hours. True when counted. */
  record(blogId: string, visitorKey: string, day: string): Promise<boolean>;
  /** Views per post on `day` (YYYY-MM-DD) and later; only the given posts when `blogIds` is passed. */
  sumSince(day: string, blogIds?: string[]): Promise<Record<string, number>>;
}

export interface ShareRepo {
  /**
   * Counts one share click unless this key was seen in the last 24 hours. The
   * key already names the post and platform (share-rules.ts). True when counted.
   */
  record(blogId: string, platform: SharePlatform, visitorKey: string, day: string): Promise<boolean>;
  /** Share clicks per post on `day` (YYYY-MM-DD) and later; only the given posts when `blogIds` is passed. */
  sumSince(day: string, blogIds?: string[]): Promise<Record<string, number>>;
  /** All-time share clicks per post, split by platform. */
  byPlatform(blogIds?: string[]): Promise<Record<string, Partial<Record<SharePlatform, number>>>>;
}

export interface ClickRepo {
  /**
   * Counts one click on `blogId` unless this key was seen in the last 24
   * hours. The key already names the post, placement and target (click-rules.ts).
   * True when counted.
   */
  record(blogId: string, placement: ClickPlacement, visitorKey: string, day: string): Promise<boolean>;
  /** Clicks per post on `day` (YYYY-MM-DD) and later; only the given posts when `blogIds` is passed. */
  sumSince(day: string, blogIds?: string[]): Promise<Record<string, number>>;
  /** All-time clicks per post, split by placement. */
  byPlacement(blogIds?: string[]): Promise<Record<string, Partial<Record<ClickPlacement, number>>>>;
}

export interface ReportRepo {
  list(resolved?: boolean): Promise<Report[]>;
  create(data: Omit<Report, "_id" | "createdAt">): Promise<Report>;
  update(id: string, patch: Partial<Report>): Promise<Report | null>;
}

/**
 * Site-wide settings an admin edits in the panel.
 *
 * One row, id "site". Kept as a named shape rather than a free key/value bag
 * so a reader of this file can see every setting that exists.
 */
/**
 * An editor's search details for one site page (lib/page-seo.ts lists the
 * pages). An empty field means the page's built-in default is used.
 */
export interface PageSeo {
  title: string;
  description: string;
  /** Share image for search and social previews; empty = the generated one. */
  imageUrl: string;
  imageAlt: string;
}

export interface OrganizationSeo {
  /** A square logo image, at least 112 × 112 px. Empty = none sent. */
  logoUrl: string;
  /** The business's own profiles elsewhere (LinkedIn, Instagram…), as full URLs. */
  sameAs: string[];
}

export interface Settings {
  _id: string;
  /** Status a new comment is created with when its post says "default". */
  commentDefault: Extract<CommentStatus, "visible" | "pending">;
  /** Turns comments off across the whole site, whatever a post says. */
  commentsEnabled: boolean;
  /** Shows the view count under posts that say "default". Off unless an admin turns it on. */
  viewsPublic: boolean;
  /** Share buttons under posts that say "default". On until an admin turns it off. */
  shareEnabled: boolean;
  /** Which share buttons show. The phone's own share sheet is not listed; it follows shareEnabled. */
  sharePlatforms: Exclude<SharePlatform, "native">[];
  /** Set once the category list was first filled from the names posts already carried (repo/index.ts). */
  categoriesSeeded: boolean;
  homepageImages?: Partial<Record<HomeImageSlot, HomepageImage>>;
  homepageContent?: HomepageContent;
  /** Keyed by page (PAGE_SEO_PAGES in lib/page-seo.ts). */
  pageSeo?: Partial<Record<string, PageSeo>>;
  /** The business as search engines describe it (Organization data, structured-data.ts). */
  organization?: OrganizationSeo;
  updatedAt: string;
}

export interface SettingsRepo {
  get(): Promise<Settings>;
  update(patch: Partial<Omit<Settings, "_id" | "updatedAt">>): Promise<Settings>;
  updateHomepageSection<K extends HomepageSection>(section: K, content: HomepageContent[K], images: Partial<Record<HomeImageSlot, HomepageImage | null>>): Promise<Settings>;
}

export interface MediaRepo {
  list(): Promise<MediaAsset[]>;
  findByIds(ids: string[]): Promise<MediaAsset[]>;
  findByChecksum(sha256: string): Promise<MediaAsset | null>;
  create(data: Omit<MediaAsset, "_id" | "createdAt" | "updatedAt">): Promise<MediaAsset>;
  findById(id: string): Promise<MediaAsset | null>;
  /** Changes the library's default alt text only; places that saved their own alt keep it. */
  updateAltText(id: string, altText: string): Promise<MediaAsset | null>;
  /** Removes the library record. The Cloudinary file is the caller's job (api/media/[id]). */
  remove(id: string): Promise<boolean>;
}

export interface DataDriver {
  blogs: BlogRepo;
  categories: CategoryRepo;
  users: UserRepo;
  comments: CommentRepo;
  reactions: ReactionRepo;
  saved: SavedRepo;
  reports: ReportRepo;
  settings: SettingsRepo;
  media: MediaRepo;
  views: ViewRepo;
  shares: ShareRepo;
  clicks: ClickRepo;
  subscribers: SubscriberRepo;
  pushDevices: PushDeviceRepo;
  notifyJobs: NotifyJobRepo;
  deliveries: DeliveryRepo;
}
