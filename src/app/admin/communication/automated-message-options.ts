/**
 * UI-preview options for the Automated message system form.
 * Every list here is sample data. When the form is connected, each list is replaced by real data
 * (works from the backend, packages from the catalogue, templates from the template store).
 */

export type Unit = "hours" | "days";

export const WORK_GROUPS: { group: string; works: string[] }[] = [
  { group: "Client / Website works", works: [
    "Package or Plan Bought", "Project Start Requested", "Bill / Order Created (Payment Pending)", "Payment Submitted (UPI)",
    "Client Uploaded Data", "Offer Reserved", "Plan / Quote Requested", "Support Ticket Opened", "User Signed Up",
    "Website Comment / Review", "Plan Renewal Stopped",
  ] },
  { group: "Admin works", works: [
    "Project Created", "Project Progress / Step Updated", "Project Cancelled", "Payment Approved", "Payment Rejected",
    "Invoice Resent", "Proposal Sent", "Message Sent to Lead", "Final Follow-up Started", "Reservation Extended",
    "Upload Status Updated", "Comment Approved",
  ] },
  { group: "System works (happen automatically)", works: [
    "Project Completed (100%)", "Plan / Package Expired", "Reservation Expired", "Broadcast Sent", "Monthly Renewal Bill Created",
  ] },
];

export const PACKAGE_SCOPES = [
  { id: "all", label: "All packages & plans" },
  { id: "monthly", label: "Monthly packages only" },
  { id: "onetime", label: "One-time packages only" },
  { id: "selected", label: "Selected packages" },
] as const;

export const PACKAGE_NAMES = ["Growth Monthly", "Starter Monthly", "Website Basic (one-time)", "Website Pro (one-time)", "Store Setup (one-time)"];

export const RECENT_GROUPS: { label: string; work: string; scope: string }[] = [
  { label: "Package Bought – Monthly only", work: "Package or Plan Bought", scope: "monthly" },
  { label: "Package Bought – All", work: "Package or Plan Bought", scope: "all" },
];

export const TEMPLATE_NAMES = [
  "Welcome – Monthly package", "New monthly customer (admin)", "Thanks, order received", "Pay now reminder",
  "Payment awaiting your approval (admin)", "Installment due reminder", "Upload limit still unused", "Plan expired – renew now",
];

export const TRIGGERS = [
  { id: "after_action", label: "after the work happens" },
  { id: "before_due", label: "before the due / expiry date" },
  { id: "on_due", label: "on the due / expiry date" },
  { id: "after_due", label: "after the due / expiry date" },
] as const;

export const CONDITIONS = [
  { id: "any", label: "Anytime (no condition)" },
  { id: "unpaid", label: "Client has not paid yet" },
  { id: "pending_approval", label: "Client paid by UPI, waiting for admin approval" },
  { id: "installment_due", label: "Installment is due" },
  { id: "progress", label: "Project progress is at or above (%)", value: true },
  { id: "limit", label: "Portal upload limit remaining is at least", value: true },
] as const;

export const STOP_POINTS = ["Payment received", "Payment approved", "Payment rejected", "Plan cancelled", "Data upload completed", "Project completed", "Comment approved"];
