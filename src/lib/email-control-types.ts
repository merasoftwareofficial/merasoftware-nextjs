import type { JSONContent } from "@tiptap/core";

export type Application = "website" | "portal";
/** review/off: an admin's action asks before sending. auto/off: customer-started mail is On or Off. */
export type EmailPolicyMode = "review" | "auto" | "off";
// `doc`/`subjectDoc` are the visual editor's documents (absent from a backend older than the editor).
export type EmailTemplate = { _id: string; event: string; name: string; subject: string; text: string; system?: boolean; doc?: JSONContent; subjectDoc?: JSONContent };
/** A detail an email may hold: `sample` is an example (template editor), `value` this email's own value (review). */
export type TemplateVariable = { key: string; label: string; hint?: string; sample?: string; value?: string };
/** Per action: whether it has an editable built-in (system) template, and what templates may use. */
export type TemplateCatalog = Record<string, { system: boolean; variables: TemplateVariable[]; blocks: TemplateVariable[] }>;
/** A review's template choices, built-in first; id "" is an older backend's code-built mail. */
export type TemplateOption = { id: string; name: string; system: boolean };
export type EmailDraft = {
  _id: string; event: string; to: string[]; subject: string; text: string;
  status: "pending" | "sending" | "sent" | "skipped" | "failed";
  requiredLinks?: string[]; attachments?: { filename: string }[];
  failure?: string; expiresAt: string; createdAt: string;
  reference?: { subscriberId?: string; tokenHash?: string };
  html?: string; templateOptions?: TemplateOption[];
  // The review as an editor document, and the chips it may use.
  doc?: JSONContent; editorFields?: { variables: TemplateVariable[]; blocks: TemplateVariable[] };
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
  // `trigger` is absent from a backend older than customer-action control; treat it as "admin".
  // `group` (the job whose mails share one box) is absent from an older backend; the label stands in.
  events: { key: string; section: string; label: string; group?: string; application: Application; trigger?: "admin" | "customer" | "system" }[];
  policies: { event: string; mode: EmailPolicyMode; defaultTemplate: string | null }[];
  // Absent from a backend older than the template system; the panel then shows legacy choices.
  catalog?: TemplateCatalog; templates: EmailTemplate[]; drafts: EmailDraft[]; history: EmailHistory[]; automaticSending: false; serverNow: number;
};
