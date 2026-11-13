/**
 * The Communication sections shown as sub-tabs in the admin sidebar. Each one
 * opens a panel of the Communication page (?panel=…). The sidebar and the page
 * both read this list, so they cannot disagree about which section is open.
 */
export const COMMUNICATION_SECTIONS = [
  { id: "broadcast", label: "Broadcast", panel: "broadcast" },
  { id: "automatic", label: "Automatic messages", panel: "email-templates" },
  { id: "reminders", label: "Reminders", panel: "reminders" },
  { id: "actions", label: "Actions", panel: "actions" },
  { id: "review", label: "Review & delivery", panel: "email-review" },
  { id: "workflows", label: "Workflows & settings", panel: "whatsapp-connection" },
] as const;

export type CommunicationSectionId = (typeof COMMUNICATION_SECTIONS)[number]["id"];

/** Which section a panel belongs to; null for the overview (no panel) and unknown panels. */
export function communicationSectionOf(panel: string | null, tab: string | null): CommunicationSectionId | null {
  if (panel === "broadcast") return "broadcast";
  if (panel === "email-templates") return "automatic";
  if (panel === "reminders") return "reminders";
  if (panel === "actions") return "actions";
  if (panel === "email-review" || panel === "business-activity") return "review";
  if (panel === "whatsapp-queue") return tab === "rules" ? "workflows" : "review";
  if (panel === "whatsapp-connection" || panel === "auto-reply" || panel === "final-message" || panel === "reservation") return "workflows";
  return null;
}
