import type { Metadata } from "next";
import Script from "next/script";
import { NavigationWarmup } from "../components/NavigationWarmup";
import "./globals.css";
import "./landing.css";

export const metadata: Metadata = {
  title: "LEGAL OFFICE AI | مساحة المكتب القانوني",
  description:
    "منصة بن حمود لإدارة مكاتب المحاماة: قضايا، جلسات، وثائق، مالية، وفريق — بعزل آمن بين المكاتب.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
        <link rel="dns-prefetch" href="https://id.bhd-om.com" />
        <link rel="dns-prefetch" href="https://www.bhd-om.com" />
      </head>
      <body>
        <NavigationWarmup />
        {children}
        <Script
          src="https://id.bhd-om.com/bhd-identity.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
