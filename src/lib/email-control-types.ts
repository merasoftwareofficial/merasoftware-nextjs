export type Application = "website" | "portal";
export type EmailTemplate = { _id: string; event: string; name: string; subject: string; text: string; system?: boolean };
export type TemplateVariable = { key: string; label: string };
/** Per action: whether it has an editable built-in (system) template, and what templates may use. */
export type TemplateCatalog = Record<string, { system: boolean; variables: TemplateVariable[]; blocks: TemplateVariable[] }>;
/** A review's template choices, built-in first; id "" is a not-yet-migrated action's code-built mail. */
export type TemplateOption = { id: string; name: string; system: boolean };
export type EmailDraft = {
  _id: string; event: string; to: string[]; subject: string; text: string;
  status: "pending" | "sending" | "sent" | "skipped" | "failed";
  requiredLinks?: string[]; attachments?: { filename: string }[];
  failure?: string; expiresAt: string; createdAt: string;
  reference?: { subscriberId?: string; tokenHash?: string };
  html?: string; templateOptions?: TemplateOption[];
};
export type EmailHistory = {
  _id: string; draftId: string; event: string; to: string[]; subject: string; status: string;
  expiresAt: string; updatedAt: string; sentAt?: string; failure?: string;
  sender?: string; templateName?: string; source?: string; providerId?: string;
  attemptCount?: number; lastAttemptAt?: string;
  attempts?: { at: string; status: string; failure?: string }[];
};
export type EmailOutboxData = {
  rows: EmailHistory[]; total: number; page: number; pageSize: number; pages: number;
  summary: { sent: number; todaySent: number; sentRecipients: number; failed: number; sending: number };
  serverNow: number;
};
export type EmailControlData = {
  application: Application;
  events: { key: string; section: string; label: string; application: Application }[];
  policies: { event: string; mode: "review" | "off"; defaultTemplate: string | null }[];
  catalog: TemplateCatalog; templates: EmailTemplate[]; drafts: EmailDraft[]; history: EmailHistory[]; automaticSending: false; serverNow: number;
};
