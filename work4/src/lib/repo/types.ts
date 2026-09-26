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

export interface FeaturedImage {
  url: string;
  publicId: string;
  alt: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  email: string;
  username: string;
  displayName: string;
  role: Role;
  bio?: string;
  banned: boolean;
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
  "_id" | "createdAt" | "updatedAt" | "helpfulCount" | "insightfulCount" | "saveCount"
>;

export interface BlogRepo {
  list(query?: BlogQuery): Promise<Blog[]>;
  count(query?: BlogQuery): Promise<number>;
  findById(id: string): Promise<Blog | null>;
  findBySlug(slug: string): Promise<Blog | null>;
  create(data: NewBlog): Promise<Blog>;
  update(id: string, patch: Partial<Blog>): Promise<Blog | null>;
  remove(id: string): Promise<boolean>;
  /** Atomic counter change used by reactions and saves. */
  incr(id: string, field: "helpfulCount" | "insightfulCount" | "saveCount", by: number): Promise<void>;
}

export interface UserRepo {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
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

export interface ReportRepo {
  list(resolved?: boolean): Promise<Report[]>;
  create(data: Omit<Report, "_id" | "createdAt">): Promise<Report>;
  update(id: string, patch: Partial<Report>): Promise<Report | null>;
}

export interface DataDriver {
  blogs: BlogRepo;
  users: UserRepo;
  comments: CommentRepo;
  reactions: ReactionRepo;
  saved: SavedRepo;
  reports: ReportRepo;
}
