import { redirect } from "next/navigation";

// WhatsApp now lives in Communication: the number and sending rules open in its side panel.
export default function WhatsappPage() {
  redirect("/admin/communication?panel=whatsapp");
}
