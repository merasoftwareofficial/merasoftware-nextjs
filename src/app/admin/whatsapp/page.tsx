import { redirect } from "next/navigation";

// WhatsApp now lives in Communication → WhatsApp Connection.
export default function WhatsappPage() {
  redirect("/admin/communication?panel=whatsapp-connection");
}
