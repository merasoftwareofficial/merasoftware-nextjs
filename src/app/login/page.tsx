import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { portalAddresses, safeNextTarget } from "@/lib/portal";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { apiUrl, portalUrl } = portalAddresses();
  const raw = (await searchParams).next;
  const next = safeNextTarget(typeof raw === "string" ? raw : undefined, portalUrl);

  return (
    <>
      <SiteHeader />
      <main className="auth-main">
        <LoginForm next={next} portalApiUrl={apiUrl} portalUrl={portalUrl} />
      </main>
      <SiteFooter />
    </>
  );
}
