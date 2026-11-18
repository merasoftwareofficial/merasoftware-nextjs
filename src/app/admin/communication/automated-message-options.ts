/**
 * UI-preview options for the Automated message system form.
 * Single unified Works / Trigger Points list used everywhere in the trail:
 * Stage start trigger, Reminder start trigger, Reminder stop trigger, and Chained next-stage trigger.
 */

export type Unit = "hours" | "days";
export type Channel = "whatsapp" | "email" | "both";
export type TimingRef = "before_due" | "on_due" | "after_due" | "after_action";

export const WORK_GROUPS: { group: string; works: string[] }[] = [
  {
    group: "Client / Website works (Trigger points)",
    works: [
      "Package or Plan Bought",
      "Bill / Order Created (Payment Pending)",
      "Payment Submitted by Client (UPI / Proof)",
      "Project Start Requested",
      "Client Uploaded Data",
      "Offer Reserved",
      "Plan / Quote Requested",
      "Support Ticket Opened",
      "User Signed Up",
      "Website Comment / Review Posted",
      "Plan Renewal Stopped",
    ],
  },
  {
    group: "Admin works (Trigger points)",
    works: [
      "Payment Recorded / Approved",
      "Payment Rejected",
      "Project Created",
      "Project Progress / Step Updated",
      "Project Cancelled",
      "Start Request Closed",
      "Plan Work Update Posted",
      "Upload Status Updated",
      "Comment Approved / Moderated",
      "Invoice Resent",
      "Proposal Sent",
      "Message Sent to Lead",
      "Final Follow-up Started",
      "Final Follow-up Stopped",
      "Reservation Extended",
    ],
  },
  {
    group: "System works (Automatic trigger points)",
    works: [
      "Installment Became Due",
      "Project Completed (100%)",
      "Plan / Package Expired (Upload Limit Left)",
      "Reservation Expired",
      "Monthly Renewal Bill Created",
      "Broadcast Sent",
      "WhatsApp Ad Reply Received",
    ],
  },
];

export const PACKAGE_SCOPES = [
  { id: "all", label: "All packages & plans" },
  { id: "monthly", label: "Monthly packages only" },
  { id: "onetime", label: "One-time packages only" },
  { id: "selected", label: "Selected packages" },
] as const;

export const PACKAGE_NAMES = [
  "Growth Monthly",
  "Starter Monthly",
  "Website Basic (one-time)",
  "Website Pro (one-time)",
  "Store Setup (one-time)",
];

export const TRIGGERS: { id: TimingRef; label: string }[] = [
  { id: "after_action", label: "after the start trigger happens" },
  { id: "before_due", label: "before the due / expiry date" },
  { id: "on_due", label: "on the due / expiry date" },
  { id: "after_due", label: "after the due / expiry date" },
];

export const CONDITIONS = [
  { id: "any", label: "No extra condition (always run)" },
  { id: "unpaid", label: "Only if payment is still unpaid" },
  { id: "pending_approval", label: "Only if UPI is waiting for admin approval" },
  { id: "installment_due", label: "Only if an installment is due" },
  { id: "progress", label: "Only if project progress is at least (%)", value: true },
  { id: "limit", label: "Only if portal upload limit remaining is at least", value: true },
] as const;

export const PLACEHOLDERS = [
  "{{name}}",
  "{{package}}",
  "{{project}}",
  "{{amount}}",
  "{{dueDate}}",
  "{{progress}}",
  "{{remainingLimit}}",
  "{{invoiceLink}}",
  "{{portalLink}}",
  "{{planLink}}",
];
