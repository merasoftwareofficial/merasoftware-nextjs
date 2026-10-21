import { redirect } from "next/navigation";

// Email Control now lives in Communication. The portal's admin link still opens ?tab=portal here.
export default async function EmailControlPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/admin/communication?view=${tab === "portal" ? "portal-actions" : "website-actions"}`);
}
