import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="auth-main">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
