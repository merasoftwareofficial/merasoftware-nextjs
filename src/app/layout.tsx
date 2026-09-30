import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { NavigationProgress } from "@/components/loading/navigation";
import { SITE_NAME, SITE_URL } from "@/lib/structured-data";
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
  title: { default: "Mera Software | Digital Growth Partner", template: "%s | Mera Software" },
  description: "Web development, SEO and performance marketing for growing businesses.",
  openGraph: { title: "Mera Software | Digital Growth Partner", description: "Web development, SEO and performance marketing for growing businesses.", type: "website", siteName: SITE_NAME },
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
