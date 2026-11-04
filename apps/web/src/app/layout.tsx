import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
