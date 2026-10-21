// Replies of the portal backend's /api/whatsapp-control (backend routes/whatsappControl.js).
export type WhatsappQueueStatus = "pending" | "sending" | "sent" | "failed" | "skipped" | "expired" | "cancelled";
export type WhatsappConnection = "disconnected" | "connecting" | "qr" | "connected" | "logged-out";

export type WhatsappStatus = {
  enabled: boolean;
  workerRunning: boolean;
  connection: WhatsappConnection;
  qr: string | null;
  phone: string | null;
  paused: boolean;
  unlinkRequested: boolean;
  sentToday: number;
  dailyLimit: number;
  nextSendAt: string | null;
  lastSentAt: string | null;
  lastError: string | null;
  messageCap: { total_quota?: number; used_quota?: number } | null;
  counts: Record<WhatsappQueueStatus, number>;
};

export type WhatsappMessage = {
  _id: string;
  to?: string;
  email?: string;
  event?: string;
  application?: "website" | "portal";
  text: string;
  status: WhatsappQueueStatus;
  attempts: number;
  lastError?: string | null;
  sentAt?: string;
  createdAt: string;
  canRetry: boolean;
};

export type WhatsappQueuePage = { rows: WhatsappMessage[]; total: number; page: number; pages: number };
