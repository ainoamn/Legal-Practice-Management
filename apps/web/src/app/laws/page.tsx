import type { Metadata } from "next";
import { LawsLibrary } from "../../components/laws/LawsLibrary";
import "./laws.css";

export const metadata: Metadata = {
  title: "مكتبة القوانين العمانية | LEGAL OFFICE AI",
  description:
    "فهرس القوانين واللوائح العمانية للقراءة صفحة بصفحة مع ترويسة رسمية قابلة للطباعة.",
};

export default function LawsPage() {
  return <LawsLibrary />;
}
