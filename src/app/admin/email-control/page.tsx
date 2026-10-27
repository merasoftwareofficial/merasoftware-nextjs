import { redirect } from "next/navigation";

// Email Control now lives in Communication, whose one list holds Website and Portal actions.
// The portal's admin link still opens ?tab=portal here; it lands on the same list.
export default function EmailControlPage() {
  redirect("/admin/communication");
}
