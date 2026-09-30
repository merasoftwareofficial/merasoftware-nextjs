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

export interface Seo {
  title: string;
  description: string;
  canonical: string;
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
  "_id" | "createdAt" | "updatedAt" | "helpfulCount" | "insightfulCount" | "saveCount" | "viewCount"
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
export interface Settings {
  _id: string;
  /** Status a new comment is created with when its post says "default". */
  commentDefault: Extract<CommentStatus, "visible" | "pending">;
  /** Turns comments off across the whole site, whatever a post says. */
  commentsEnabled: boolean;
  /** Shows the view count under posts that say "default". Off unless an admin turns it on. */
  viewsPublic: boolean;
  homepageImages?: Partial<Record<HomeImageSlot, HomepageImage>>;
  updatedAt: string;
}

export interface SettingsRepo {
  get(): Promise<Settings>;
  update(patch: Partial<Omit<Settings, "_id" | "updatedAt">>): Promise<Settings>;
}

export interface MediaRepo {
  list(): Promise<MediaAsset[]>;
  findByIds(ids: string[]): Promise<MediaAsset[]>;
  findByChecksum(sha256: string): Promise<MediaAsset | null>;
  create(data: Omit<MediaAsset, "_id" | "createdAt" | "updatedAt">): Promise<MediaAsset>;
}

export interface DataDriver {
  blogs: BlogRepo;
  users: UserRepo;
  comments: CommentRepo;
  reactions: ReactionRepo;
  saved: SavedRepo;
  reports: ReportRepo;
  settings: SettingsRepo;
  media: MediaRepo;
  views: ViewRepo;
}
