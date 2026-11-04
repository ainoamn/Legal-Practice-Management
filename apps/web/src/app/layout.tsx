import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEGAL OFFICE AI | مساحة المكتب",
  description: "إدارة الهوية والصلاحيات ومساحات مكاتب المحاماة",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {children}
        <Script
          src="https://id.bhd-om.com/bhd-identity.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
