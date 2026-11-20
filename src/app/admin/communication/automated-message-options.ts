import type { ActionPackageOption, ActionsData, TriggerGroup } from "./action-rule-helpers";

/**
 * Unified options & live read-only catalog builder for the Automated message system UI.
 * Loads real Trigger Points / Works and real Packages from GET /api/auto-reply/actions.
 */

export type Unit = "days" | "hours";
export type Channel = "whatsapp" | "email" | "both";
export type TimingPos = "before" | "on" | "after";
export type BaseDate = "trigger_date" | "due_date" | "expiry_date" | "deadline_date";
export type InstantAudience = "off" | "client" | "admin" | "both";
export type ReminderAudience = "client" | "admin" | "both";
export type MessageMode = "separate" | "universal";
export type RepeatMode = "off" | "permanent" | "limited";
export type PackageScopeMode = "all" | "monthly" | "onetime" | "include" | "exclude";

export type WorkItem = {
  key: string;
  label: string;
  folder: string;
  when: string;
  supportsScope: boolean;
  supportsProgress: boolean;
  supportsLimit: boolean;
  defaultStopOn: string[];
  upcoming?: boolean;
};

export type WorkFolder = {
  folder: string;
  items: WorkItem[];
};

const UPCOMING_WORKS: WorkItem[] = [
  {
    key: "comment.posted",
    label: "Website Comment / Review Posted",
    folder: "Website Content, Products, Broadcast & Settings",
    when: "When a visitor or client posts a new comment or review on the website.",
    supportsScope: false,
    supportsProgress: false,
    supportsLimit: false,
    defaultStopOn: ["comment.approved"],
    upcoming: true,
  },
  {
    key: "comment.approved",
    label: "Comment Approved / Moderated",
    folder: "Website Content, Products, Broadcast & Settings",
    when: "When an admin approves or moderates a website comment.",
    supportsScope: false,
    supportsProgress: false,
    supportsLimit: false,
    defaultStopOn: [],
    upcoming: true,
  },
  {
    key: "plan.expired",
    label: "Plan / Package Expired",
    folder: "Plans & Packages",
    when: "When a monthly plan or package expires (can check remaining upload limit).",
    supportsScope: true,
    supportsProgress: false,
    supportsLimit: true,
    defaultStopOn: ["payment.received"],
    upcoming: true,
  },
];

const FALLBACK_WORKS: WorkItem[] = [
  {
    key: "package.purchased",
    label: "Package or Plan Bought",
    folder: "Plans & Packages",
    when: "When a client buys a one-time or monthly package or starts a service plan.",
    supportsScope: true,
    supportsProgress: false,
    supportsLimit: true,
    defaultStopOn: ["payment.received"],
  },
  {
    key: "invoice.created",
    label: "Invoice / Bill Created",
    folder: "Payments & Invoices",
    when: "When a project, plan, package, installment, or monthly renewal creates a bill.",
    supportsScope: true,
    supportsProgress: false,
    supportsLimit: true,
    defaultStopOn: ["payment.received"],
  },
  {
    key: "order.upi_pending",
    label: "Order Created (UPI Pending)",
    folder: "Payments & Invoices",
    when: "When a client submits a UPI order waiting for admin verification.",
    supportsScope: true,
    supportsProgress: false,
    supportsLimit: false,
    defaultStopOn: ["payment.received"],
  },
  {
    key: "payment.received",
    label: "Payment Received / Approved",
    folder: "Payments & Invoices",
    when: "When an invoice or order is marked paid or approved by admin.",
    supportsScope: false,
    supportsProgress: false,
    supportsLimit: false,
    defaultStopOn: [],
  },
  {
    key: "plan.payment_rejected",
    label: "Payment Rejected",
    folder: "Payments & Invoices",
    when: "When an admin rejects a submitted plan or wallet payment.",
    supportsScope: false,
    supportsProgress: false,
    supportsLimit: false,
    defaultStopOn: [],
  },
  {
    key: "project.created",
    label: "Project Created",
    folder: "Projects & Previews",
    when: "When an admin creates a new project order for a client.",
    supportsScope: true,
    supportsProgress: true,
    supportsLimit: false,
    defaultStopOn: ["payment.received"],
  },
  {
    key: "project.step_updated",
    label: "Project Progress / Step Updated",
    folder: "Projects & Previews",
    when: "When an admin updates a project step or progress percentage.",
    supportsScope: true,
    supportsProgress: true,
    supportsLimit: false,
    defaultStopOn: ["payment.received"],
  },
  {
    key: "upload.completed",
    label: "Client Uploaded Data",
    folder: "Data Uploads & Documents",
    when: "When a client uploads required files in the portal.",
    supportsScope: false,
    supportsProgress: false,
    supportsLimit: false,
    defaultStopOn: [],
  },
  {
    key: "ticket.updated",
    label: "Support Ticket Opened / Replied",
    folder: "Login, Profile, Accounts & Support",
    when: "When a client opens a support ticket or posts a reply.",
    supportsScope: false,
    supportsProgress: false,
    supportsLimit: false,
    defaultStopOn: [],
  },
  {
    key: "user.signed_up",
    label: "User Signed Up",
    folder: "Login, Profile, Accounts & Support",
    when: "When a new user signs up on the website.",
    supportsScope: false,
    supportsProgress: false,
    supportsLimit: false,
    defaultStopOn: [],
  },
];

function triggerToWork(t: TriggerGroup): WorkItem {
  return {
    key: t.triggerKey,
    label: t.label,
    folder: t.folder || "Other works",
    when: t.when || "",
    supportsScope: Boolean(t.supportsScope),
    supportsProgress: Boolean(t.supportsProgress),
    supportsLimit: Boolean(t.supportsLimit),
    defaultStopOn: Array.isArray(t.defaultStopOn) ? t.defaultStopOn : [],
  };
}

export function buildWorkCatalog(data: ActionsData | null): {
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  packages: ActionPackageOption[];
  isLive: boolean;
} {
  const isLive = Boolean(data?.triggers && data.triggers.length > 0);
  const raw: WorkItem[] = isLive ? data!.triggers!.map(triggerToWork) : [...FALLBACK_WORKS];
  const byKey = new Map<string, WorkItem>();
  for (const item of raw) byKey.set(item.key, item);
  for (const extra of UPCOMING_WORKS) {
    if (!byKey.has(extra.key)) {
      raw.push(extra);
      byKey.set(extra.key, extra);
    }
  }

  const folderMap = new Map<string, WorkItem[]>();
  const preferredOrder = data?.folders?.length ? data.folders : [];
  for (const name of preferredOrder) folderMap.set(name, []);
  for (const item of raw) {
    const list = folderMap.get(item.folder) ?? [];
    list.push(item);
    folderMap.set(item.folder, list);
  }

  const folders: WorkFolder[] = [];
  for (const [folder, items] of folderMap.entries()) {
    if (items.length > 0) folders.push({ folder, items });
  }

  return {
    folders,
    byKey,
    packages: data?.packages ?? [],
    isLive,
  };
}

export const PACKAGE_SCOPES: { id: PackageScopeMode; label: string }[] = [
  { id: "all", label: "All packages & plans" },
  { id: "monthly", label: "Monthly packages only" },
  { id: "onetime", label: "One-time packages only" },
  { id: "include", label: "Include specific packages…" },
  { id: "exclude", label: "Exclude specific packages…" },
];

export const BASE_DATES: { id: BaseDate; label: string }[] = [
  { id: "trigger_date", label: "Start trigger date" },
  { id: "due_date", label: "Invoice / Payment due date" },
  { id: "expiry_date", label: "Package / Plan expiry date" },
  { id: "deadline_date", label: "Project deadline" },
];

export const CONDITIONS = [
  { id: "any", label: "No extra condition (always run)" },
  { id: "unpaid", label: "Payment is still unpaid" },
  { id: "pending_approval", label: "UPI submitted — waiting for admin approval" },
  { id: "installment_due", label: "Installment is due" },
  { id: "upload_pending", label: "Client data upload is pending" },
  { id: "progress_min", label: "Project progress is at least (%)", value: true, defaultVal: 50, max: 100 },
  { id: "limit_min", label: "Portal upload limit remaining is at least", value: true, defaultVal: 1, max: 1000 },
  { id: "limit_max", label: "Portal upload limit remaining is at most", value: true, defaultVal: 2, max: 1000 },
] as const;

export const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "{{name}}", label: "Client name" },
  { token: "{{package}}", label: "Package / Plan" },
  { token: "{{project}}", label: "Project name" },
  { token: "{{amount}}", label: "Amount" },
  { token: "{{dueDate}}", label: "Due date" },
  { token: "{{progress}}", label: "Progress %" },
  { token: "{{remainingLimit}}", label: "Upload limit left" },
  { token: "{{invoiceLink}}", label: "Invoice link" },
  { token: "{{portalLink}}", label: "Portal link" },
  { token: "{{planLink}}", label: "Plan link" },
];
