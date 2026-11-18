/**
 * UI-preview options for the Automated message system form.
 * Every list here is sample data. When the form is connected, each list is replaced by real data
 * (works from the backend, packages from the catalogue, placeholders from actionEvents).
 */

export type Unit = "hours" | "days";
export type Channel = "whatsapp" | "email" | "both";
export type TimingRef = "before_due" | "on_due" | "after_due" | "after_action";

export const WORK_GROUPS: { group: string; works: string[] }[] = [
  {
    group: "Client / Website works",
    works: [
      "Package or Plan Bought",
      "Project Start Requested",
      "Bill / Order Created (Payment Pending)",
      "Payment Submitted (UPI)",
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
    group: "Admin works",
    works: [
      "Project Created",
      "Project Progress / Step Updated",
      "Project Cancelled",
      "Payment Approved",
      "Payment Rejected",
      "Invoice Resent",
      "Proposal Sent",
      "Message Sent to Lead",
      "Final Follow-up Started",
      "Reservation Extended",
      "Upload Status Updated",
      "Comment Approved",
    ],
  },
  {
    group: "System works (happen automatically)",
    works: [
      "Project Completed (100%)",
      "Plan / Package Expired",
      "Reservation Expired",
      "Broadcast Sent",
      "Monthly Renewal Bill Created",
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

/** Clear, human-readable trigger points that START a reminder branch. */
export const START_TRIGGERS = [
  { id: "main_work", label: "As soon as the main work happens" },
  { id: "payment_pending", label: "Client has not paid yet (payment pending)" },
  { id: "upi_submitted", label: "Client submitted UPI, waiting for admin approval" },
  { id: "installment_due", label: "Installment becomes due" },
  { id: "upload_pending", label: "Client has not uploaded project data yet" },
  { id: "progress_reached", label: "Project progress reaches a milestone (%)" },
  { id: "plan_expired_unused", label: "Plan / package expired while upload limit is still left" },
  { id: "comment_unapproved", label: "Website comment posted and not yet approved by admin" },
  { id: "reservation_active", label: "Offer reserved and payment is still pending" },
] as const;

/** Clear, human-readable trigger points that STOP a reminder branch. */
export const STOP_TRIGGERS = [
  { id: "payment_received", label: "Payment is received / approved" },
  { id: "upi_submitted", label: "Client submits UPI / payment proof" },
  { id: "payment_rejected", label: "Admin rejects the payment" },
  { id: "plan_cancelled", label: "Plan or project is cancelled" },
  { id: "upload_completed", label: "Client completes data upload" },
  { id: "project_completed", label: "Project reaches 100% completion" },
  { id: "comment_approved", label: "Admin approves or moderates the comment" },
  { id: "plan_renewed", label: "Client renews the plan / package" },
  { id: "reservation_expired", label: "Reservation expires" },
] as const;

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
