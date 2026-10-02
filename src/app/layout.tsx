import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { NavigationProgress } from "@/components/loading/navigation";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/structured-data";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  // Pages without a share image of their own get the generated one (app/og/route.tsx).
  openGraph: { title: SITE_TITLE, description: SITE_DESCRIPTION, type: "website", siteName: SITE_NAME, images: [{ url: "/og", width: 1200, height: 630, alt: SITE_TITLE }] },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-VDLVCHHP71"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-VDLVCHHP71');
          `}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        {/* One page loader for every page and panel tab; see src/components/loading. */}
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
