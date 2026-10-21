import { redirect } from "next/navigation";

// WhatsApp now lives in Communication.
export default function WhatsappPage() {
  redirect("/admin/communication?view=whatsapp-number");
}
