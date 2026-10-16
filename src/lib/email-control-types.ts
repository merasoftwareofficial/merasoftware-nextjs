export type Application = "website" | "portal";
export type EmailTemplate = { _id: string; event: string; name: string; subject: string; text: string };
export type EmailDraft = {
  _id: string; event: string; to: string[]; subject: string; text: string;
  status: "pending" | "sending" | "sent" | "skipped" | "failed";
  requiredLinks?: string[]; attachments?: { filename: string }[];
  failure?: string; expiresAt: string; createdAt: string;
  reference?: { subscriberId?: string; tokenHash?: string };
};
export type EmailHistory = { _id: string; draftId: string; event: string; to: string[]; subject: string; status: string; expiresAt: string; updatedAt: string; failure?: string };
export type EmailControlData = {
  application: Application;
  events: { key: string; section: string; label: string; application: Application }[];
  policies: { event: string; mode: "review" | "off"; defaultTemplate: string | null }[];
  templates: EmailTemplate[]; drafts: EmailDraft[]; history: EmailHistory[]; automaticSending: false;
};
