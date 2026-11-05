/**
 * يجلب النصوص المجمّعة من qanoon.om (نقل عن الجريدة الرسمية)
 * ويكتب ملفات القراءة في مكتبة القوانين.
 *
 *   node scripts/import-qanoon-laws.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = path.join(root, "apps/web/src/lib/laws/corpus");
const catalogPath = path.join(root, "apps/web/src/lib/laws/catalog.json");
const loaderPath = path.join(root, "apps/web/src/lib/laws/load-law.ts");

/** قوانين المكتب: النص الكامل حيث نشره الموقع صفحةً مجمّعة أو مرسوم إصدار يتضمن القانون. */
const LAWS = [
  {
    slug: "basic-statute",
    url: "https://qanoon.om/p/2021/l2021006/",
    titleAr: "النظام الأساسي للدولة",
    titleEn: "Basic Statute of the State",
    year: 2021,
    categoryAr: "نظام الدولة",
    categoryEn: "State",
    summaryAr: "النظام الأساسي للدولة وحقوق المواطنين وتنظيم السلطات العامة.",
    summaryEn: "The Basic Statute of the State, public rights, and the organisation of public authorities.",
    decree: "المرسوم السلطاني رقم ٦ / ٢٠٢١",
  },
  {
    slug: "penal-code",
    url: "https://qanoon.om/p/2018/l2018007/",
    titleAr: "قانون الجزاء",
    titleEn: "Penal Code",
    year: 2018,
    categoryAr: "جزاء",
    categoryEn: "Criminal",
    summaryAr: "النص المجمّع لقانون الجزاء: أركان الجريمة والعقوبة، والجرائم على الأشخاص والأموال والأمن والمال العام.",
    summaryEn: "Consolidated Penal Code: elements of offences and penalties, and crimes against persons, property, security, and public funds.",
    decree: "المرسوم السلطاني رقم ٧ / ٢٠١٨",
  },
  {
    slug: "criminal-procedure",
    url: "https://qanoon.om/p/1999/l1999097/",
    titleAr: "قانون الإجراءات الجزائية",
    titleEn: "Criminal Procedure Law",
    year: 1999,
    categoryAr: "جزاء",
    categoryEn: "Criminal",
    summaryAr: "الدعوى العمومية والتحقيق والمحاكمة وطرق الطعن والتنفيذ في المواد الجزائية.",
    summaryEn: "Public prosecution, investigation, trial, appeal, and enforcement in criminal matters.",
    decree: "المرسوم السلطاني رقم ٩٧ / ٩٩",
  },
  {
    slug: "public-prosecution",
    url: "https://qanoon.om/p/1999/l1999092/",
    titleAr: "قانون الادعاء العام",
    titleEn: "Public Prosecution Law",
    year: 1999,
    categoryAr: "جزاء",
    categoryEn: "Criminal",
    summaryAr: "تنظيم الادعاء العام واختصاصاته في الدعوى العمومية.",
    summaryEn: "Organisation and jurisdiction of the Public Prosecution in criminal proceedings.",
    decree: "المرسوم السلطاني رقم ٩٢ / ٩٩",
  },
  {
    slug: "narcotics-law",
    url: "https://qanoon.om/p/1999/l1999017/",
    titleAr: "قانون مكافحة المخدرات والمؤثرات العقلية",
    titleEn: "Narcotics and Psychotropic Substances Law",
    year: 1999,
    categoryAr: "جزاء",
    categoryEn: "Criminal",
    summaryAr: "تجريم التعامل في المخدرات والمؤثرات العقلية والعقوبات والإجراءات الخاصة بها.",
    summaryEn: "Offences, penalties, and procedures concerning narcotics and psychotropic substances.",
    decree: "المرسوم السلطاني رقم ١٧ / ٩٩",
  },
  {
    slug: "extradition-law",
    url: "https://qanoon.om/p/2000/l2000004/",
    titleAr: "قانون تسليم المجرمين",
    titleEn: "Extradition Law",
    year: 2000,
    categoryAr: "جزاء",
    categoryEn: "Criminal",
    summaryAr: "شروط وإجراءات تسليم الأشخاص المطلوبين إلى دولة أجنبية أو منها.",
    summaryEn: "Conditions and procedure for extradition to or from a foreign state.",
    decree: "المرسوم السلطاني رقم ٤ / ٢٠٠٠",
  },
  {
    slug: "judicial-authority",
    url: "https://qanoon.om/p/1999/l1999090/",
    titleAr: "قانون السلطة القضائية",
    titleEn: "Judicial Authority Law",
    year: 1999,
    categoryAr: "قضاء",
    categoryEn: "Judiciary",
    summaryAr: "ترتيب المحاكم ودرجاتها وضمانات القضاة.",
    summaryEn: "Court structure, instances, and judicial guarantees.",
    decree: "المرسوم السلطاني رقم ٩٠ / ٩٩",
  },
  {
    slug: "admin-court",
    url: "https://qanoon.om/p/1999/l1999091/",
    titleAr: "قانون محكمة القضاء الإداري",
    titleEn: "Administrative Court Law",
    year: 1999,
    categoryAr: "قضاء",
    categoryEn: "Judiciary",
    summaryAr: "اختصاص محكمة القضاء الإداري وطعون القرارات الإدارية.",
    summaryEn: "Jurisdiction of the Administrative Court and challenges to administrative decisions.",
    decree: "المرسوم السلطاني رقم ٩١ / ٩٩",
  },
  {
    slug: "investment-court",
    url: "https://qanoon.om/p/2025/l2025035/",
    titleAr: "قانون محكمة الاستثمار والتجارة",
    titleEn: "Investment and Commerce Court Law",
    year: 2025,
    categoryAr: "قضاء",
    categoryEn: "Judiciary",
    summaryAr: "اختصاص محكمة الاستثمار والتجارة وإجراءات الدعاوى التجارية والاستثمارية.",
    summaryEn: "Jurisdiction and procedure of the Investment and Commerce Court.",
    decree: "المرسوم السلطاني رقم ٣٥ / ٢٠٢٥",
  },
  {
    slug: "advocacy-law",
    url: "https://qanoon.om/p/1996/l1996108/",
    titleAr: "قانون المحاماة",
    titleEn: "Advocacy Law",
    year: 1996,
    categoryAr: "قضاء",
    categoryEn: "Judiciary",
    summaryAr: "شروط مزاولة المحاماة وحقوق المحامي وواجباته وتأديبه.",
    summaryEn: "Admission to practice, advocates’ rights and duties, and discipline.",
    decree: "المرسوم السلطاني رقم ١٠٨ / ٩٦",
  },
  {
    slug: "notaries-law",
    url: "https://qanoon.om/p/2003/l2003040/",
    titleAr: "قانون الكتاب بالعدل",
    titleEn: "Notaries Law",
    year: 2003,
    categoryAr: "توثيق",
    categoryEn: "Notarial",
    summaryAr: "تنظيم أعمال التوثيق واختصاص الكتاب بالعدل والمحررات الرسمية.",
    summaryEn: "Notarial practice, powers of notaries, and official instruments.",
    decree: "المرسوم السلطاني رقم ٤٠ / ٢٠٠٣",
  },
  {
    slug: "civil-transactions",
    url: "https://qanoon.om/p/2013/rd2013029/",
    titleAr: "قانون المعاملات المدنية",
    titleEn: "Civil Transactions Law",
    year: 2013,
    categoryAr: "مدني",
    categoryEn: "Civil",
    summaryAr: "الالتزامات والعقود والملكية والحقوق العينية كما صدرت بالمرسوم ٢٩ / ٢٠١٣.",
    summaryEn: "Obligations, contracts, ownership, and real rights as issued by Royal Decree 29/2013.",
    decree: "المرسوم السلطاني رقم ٢٩ / ٢٠١٣",
  },
  {
    slug: "civil-commercial-procedure",
    url: "https://qanoon.om/p/2002/l2002029/",
    titleAr: "قانون الإجراءات المدنية والتجارية",
    titleEn: "Civil and Commercial Procedure Law",
    year: 2002,
    categoryAr: "مدني",
    categoryEn: "Civil",
    summaryAr: "رفع الدعوى والاختصاص والإثبات الإجرائي والأحكام وطرق الطعن والتنفيذ.",
    summaryEn: "Claims, jurisdiction, judgments, appeals, and enforcement in civil and commercial cases.",
    decree: "المرسوم السلطاني رقم ٢٩ / ٢٠٠٢",
  },
  {
    slug: "evidence-law",
    url: "https://qanoon.om/p/2008/rd2008068/",
    titleAr: "قانون الإثبات في المعاملات المدنية والتجارية",
    titleEn: "Evidence Law",
    year: 2008,
    categoryAr: "مدني",
    categoryEn: "Civil",
    summaryAr: "وسائل الإثبات في المعاملات المدنية والتجارية: الكتابة والشهادة والإقرار واليمين والخبرة.",
    summaryEn: "Means of proof in civil and commercial matters: documents, testimony, admission, oath, and expertise.",
    decree: "المرسوم السلطاني رقم ٦٨ / ٢٠٠٨",
  },
  {
    slug: "arbitration-law",
    url: "https://qanoon.om/p/1997/l1997047/",
    titleAr: "قانون التحكيم في المنازعات المدنية والتجارية",
    titleEn: "Arbitration Law",
    year: 1997,
    categoryAr: "مدني",
    categoryEn: "Civil",
    summaryAr: "اتفاق التحكيم وتشكيل الهيئة وإجراءاتها وحجية حكم التحكيم وتنفيذه.",
    summaryEn: "Arbitration agreements, tribunals, awards, and enforcement.",
    decree: "المرسوم السلطاني رقم ٤٧ / ٩٧",
  },
  {
    slug: "tenancy-law",
    url: "https://qanoon.om/p/1989/l1989006/",
    titleAr: "قانون العلاقة بين الملاك والمستأجرين",
    titleEn: "Tenancy Law",
    year: 1989,
    categoryAr: "مدني",
    categoryEn: "Civil",
    summaryAr: "الأحكام المنظمة للعلاقة بين ملاك ومستأجري المساكن والمحال وتسجيل عقود الإيجار.",
    summaryEn: "Rules governing landlords and tenants of homes and commercial premises, and lease registration.",
    decree: "المرسوم السلطاني رقم ٦ / ٨٩",
  },
  {
    slug: "waqf-law",
    url: "https://qanoon.om/p/2000/l2000065/",
    titleAr: "قانون الأوقاف",
    titleEn: "Endowments Law",
    year: 2000,
    categoryAr: "مدني",
    categoryEn: "Civil",
    summaryAr: "إنشاء الوقف وإدارته والولاية عليه.",
    summaryEn: "Creation, management, and supervision of waqf endowments.",
    decree: "المرسوم السلطاني رقم ٦٥ / ٢٠٠٠",
  },
  {
    slug: "personal-status",
    url: "https://qanoon.om/p/1997/rd1997032/",
    titleAr: "قانون الأحوال الشخصية",
    titleEn: "Personal Status Law",
    year: 1997,
    categoryAr: "أحوال شخصية",
    categoryEn: "Personal status",
    summaryAr: "الزواج والطلاق والنسب والنفقة والحضانة والميراث وفق مرسوم الإصدار.",
    summaryEn: "Marriage, divorce, lineage, maintenance, custody, and inheritance as published with the issuing decree.",
    decree: "المرسوم السلطاني رقم ٣٢ / ٩٧",
    minArticles: 40,
  },
  {
    slug: "civil-status",
    url: "https://qanoon.om/p/1999/l1999066/",
    titleAr: "قانون الأحوال المدنية",
    titleEn: "Civil Status Law",
    year: 1999,
    categoryAr: "أحوال شخصية",
    categoryEn: "Personal status",
    summaryAr: "سجل الأحوال المدنية والواقعات: الميلاد والوفاة والزواج وقيد الأسرة.",
    summaryEn: "Civil registry and vital events: birth, death, marriage, and family records.",
    decree: "المرسوم السلطاني رقم ٦٦ / ٩٩",
  },
  {
    slug: "commercial-law",
    url: "https://qanoon.om/p/1990/l1990055/",
    titleAr: "قانون التجارة",
    titleEn: "Commercial Law",
    year: 1990,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "الأعمال التجارية والتاجر والمتجر والعقود التجارية والأوراق التجارية والإفلاس التجاري.",
    summaryEn: "Commercial acts, merchants, commercial contracts, negotiable instruments, and bankruptcy.",
    decree: "المرسوم السلطاني رقم ٥٥ / ٩٠",
  },
  {
    slug: "companies-law",
    url: "https://qanoon.om/p/2019/rd2019018/",
    titleAr: "قانون الشركات التجارية",
    titleEn: "Commercial Companies Law",
    year: 2019,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "تأسيس الشركات وإدارتها وحلها وفق مرسوم الإصدار ١٨ / ٢٠١٩.",
    summaryEn: "Incorporation, governance, and dissolution of companies under Royal Decree 18/2019.",
    decree: "المرسوم السلطاني رقم ١٨ / ٢٠١٩",
  },
  {
    slug: "commercial-agencies",
    url: "https://qanoon.om/p/1977/l1977026/",
    titleAr: "قانون الوكالات التجارية",
    titleEn: "Commercial Agencies Law",
    year: 1977,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "تسجيل الوكالات التجارية والتزامات الموكل والوكيل وإنهاء الوكالة.",
    summaryEn: "Registration of commercial agencies and the duties and termination of agency.",
    decree: "المرسوم السلطاني رقم ٢٦ / ٧٧",
  },
  {
    slug: "bankruptcy-law",
    url: "https://qanoon.om/p/2019/rd2019053/",
    titleAr: "قانون الإفلاس",
    titleEn: "Bankruptcy Law",
    year: 2019,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "إعادة الهيكلة والإفلاس والصلح الواقي من الإفلاس.",
    summaryEn: "Restructuring, bankruptcy, and preventive composition.",
    decree: "المرسوم السلطاني رقم ٥٣ / ٢٠١٩",
  },
  {
    slug: "foreign-capital",
    url: "https://qanoon.om/p/2019/rd2019050/",
    titleAr: "قانون استثمار رأس المال الأجنبي",
    titleEn: "Foreign Capital Investment Law",
    year: 2019,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "شروط استثمار رأس المال الأجنبي والحوافز والضمانات.",
    summaryEn: "Conditions, incentives, and guarantees for foreign capital investment.",
    decree: "المرسوم السلطاني رقم ٥٠ / ٢٠١٩",
  },
  {
    slug: "banking-law",
    url: "https://qanoon.om/p/2000/l2000114/",
    titleAr: "القانون المصرفي",
    titleEn: "Banking Law",
    year: 2000,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "تنظيم الأعمال المصرفية والرقابة على المصارف.",
    summaryEn: "Regulation and supervision of banking business.",
    decree: "المرسوم السلطاني رقم ١١٤ / ٢٠٠٠",
  },
  {
    slug: "capital-market",
    url: "https://qanoon.om/p/1998/l1998080/",
    titleAr: "قانون سوق رأس المال",
    titleEn: "Capital Market Law",
    year: 1998,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "تنظيم سوق رأس المال والأوراق المالية والجهات العاملة فيها.",
    summaryEn: "Regulation of the capital market, securities, and market participants.",
    decree: "المرسوم السلطاني رقم ٨٠ / ٩٨",
  },
  {
    slug: "competition-law",
    url: "https://qanoon.om/p/2014/l2014067/",
    titleAr: "قانون حماية المنافسة ومنع الاحتكار",
    titleEn: "Competition and Antitrust Law",
    year: 2014,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "حظر الاتفاقات والممارسات الاحتكارية والتركز الاقتصادي الضار بالمنافسة.",
    summaryEn: "Prohibition of anticompetitive agreements, practices, and harmful economic concentration.",
    decree: "المرسوم السلطاني رقم ٦٧ / ٢٠١٤",
  },
  {
    slug: "consumer-protection",
    url: "https://qanoon.om/p/2014/rd2014066/",
    titleAr: "قانون حماية المستهلك",
    titleEn: "Consumer Protection Law",
    year: 2014,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "حقوق المستهلك والتزامات المزود والعقوبات.",
    summaryEn: "Consumer rights, supplier duties, and penalties.",
    decree: "المرسوم السلطاني رقم ٦٦ / ٢٠١٤",
  },
  {
    slug: "tenders-law",
    url: "https://qanoon.om/p/2008/l2008036/",
    titleAr: "قانون المناقصات",
    titleEn: "Tenders Law",
    year: 2008,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "إجراءات التعاقد الحكومي والمناقصات والمشتريات.",
    summaryEn: "Government contracting, tenders, and procurement.",
    decree: "المرسوم السلطاني رقم ٣٦ / ٢٠٠٨",
  },
  {
    slug: "free-zones",
    url: "https://qanoon.om/p/2002/l2002056/",
    titleAr: "قانون المناطق الحرة",
    titleEn: "Free Zones Law",
    year: 2002,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "إنشاء المناطق الحرة والمزايا والالتزامات داخلها.",
    summaryEn: "Establishment of free zones and the privileges and duties inside them.",
    decree: "المرسوم السلطاني رقم ٥٦ / ٢٠٠٢",
  },
  {
    slug: "maritime-law",
    url: "https://qanoon.om/p/1981/l1981035/",
    titleAr: "القانون البحري",
    titleEn: "Maritime Law",
    year: 1981,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "السفينة والنقل البحري والتصادم والإنقاذ.",
    summaryEn: "Vessels, carriage by sea, collision, and salvage.",
    decree: "المرسوم السلطاني رقم ٣٥ / ٨١",
  },
  {
    slug: "electronic-transactions",
    url: "https://qanoon.om/p/2008/l2008069/",
    titleAr: "قانون المعاملات الإلكترونية",
    titleEn: "Electronic Transactions Law",
    year: 2008,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "حجية المعاملات والتوقيع الإلكتروني والمستندات الإلكترونية.",
    summaryEn: "Validity of electronic transactions, signatures, and records.",
    decree: "المرسوم السلطاني رقم ٦٩ / ٢٠٠٨",
  },
  {
    slug: "copyright-law",
    url: "https://qanoon.om/p/2008/l2008065/",
    titleAr: "قانون حقوق المؤلف والحقوق المجاورة",
    titleEn: "Copyright Law",
    year: 2008,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "حماية المصنفات وحقوق المؤلف والحقوق المجاورة.",
    summaryEn: "Protection of works, copyright, and neighbouring rights.",
    decree: "المرسوم السلطاني رقم ٦٥ / ٢٠٠٨",
  },
  {
    slug: "industrial-property",
    url: "https://qanoon.om/p/2008/l2008067/",
    titleAr: "قانون حقوق الملكية الصناعية",
    titleEn: "Industrial Property Law",
    year: 2008,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "براءات الاختراع والعلامات التجارية والرسوم والنماذج الصناعية.",
    summaryEn: "Patents, trademarks, and industrial designs.",
    decree: "المرسوم السلطاني رقم ٦٧ / ٢٠٠٨",
  },
  {
    slug: "aml-law",
    url: "https://qanoon.om/p/2016/rd2016030/",
    titleAr: "قانون مكافحة غسل الأموال وتمويل الإرهاب",
    titleEn: "Anti-Money Laundering Law",
    year: 2016,
    categoryAr: "تجاري",
    categoryEn: "Commercial",
    summaryAr: "التزامات الإبلاغ والتجريم والعقوبات في غسل الأموال وتمويل الإرهاب.",
    summaryEn: "Reporting duties, offences, and penalties for money laundering and terrorist financing.",
    decree: "المرسوم السلطاني رقم ٣٠ / ٢٠١٦",
  },
  {
    slug: "labour-law",
    url: "https://qanoon.om/p/2023/l2023053/",
    titleAr: "قانون العمل",
    titleEn: "Labour Law",
    year: 2023,
    categoryAr: "عمل",
    categoryEn: "Labour",
    summaryAr: "عقد العمل وحقوق العامل وصاحب العمل والأجور والإجازات وإنهاء الخدمة.",
    summaryEn: "Employment contracts, wages, leave, and termination.",
    decree: "المرسوم السلطاني رقم ٥٣ / ٢٠٢٣",
  },
  {
    slug: "social-protection",
    url: "https://qanoon.om/p/2023/l2023052/",
    titleAr: "قانون الحماية الاجتماعية",
    titleEn: "Social Protection Law",
    year: 2023,
    categoryAr: "عمل",
    categoryEn: "Labour",
    summaryAr: "منافع الحماية الاجتماعية والاشتراكات والفئات المشمولة.",
    summaryEn: "Social protection benefits, contributions, and covered categories.",
    decree: "المرسوم السلطاني رقم ٥٢ / ٢٠٢٣",
  },
  {
    slug: "civil-service",
    url: "https://qanoon.om/p/2004/l2004120/",
    titleAr: "قانون الخدمة المدنية",
    titleEn: "Civil Service Law",
    year: 2004,
    categoryAr: "عمل",
    categoryEn: "Labour",
    summaryAr: "شغل الوظائف العامة وواجبات الموظف والجزاءات وإنهاء الخدمة.",
    summaryEn: "Public employment, duties, discipline, and termination of service.",
    decree: "المرسوم السلطاني رقم ١٢٠ / ٢٠٠٤",
  },
  {
    slug: "foreign-residence",
    url: "https://qanoon.om/p/1995/l1995016/",
    titleAr: "قانون إقامة الأجانب",
    titleEn: "Foreigners Residence Law",
    year: 1995,
    categoryAr: "عمل",
    categoryEn: "Labour",
    summaryAr: "دخول الأجانب وإقامتهم وتأشيرات العمل ومغادرتهم.",
    summaryEn: "Entry, residence, work visas, and departure of foreigners.",
    decree: "المرسوم السلطاني رقم ١٦ / ٩٥",
  },
  {
    slug: "income-tax",
    url: "https://qanoon.om/p/2009/l2009028/",
    titleAr: "قانون ضريبة الدخل",
    titleEn: "Income Tax Law",
    year: 2009,
    categoryAr: "ضرائب",
    categoryEn: "Tax",
    summaryAr: "وعاء ضريبة الدخل والإعفاءات والربط والتحصيل.",
    summaryEn: "Income tax base, exemptions, assessment, and collection.",
    decree: "المرسوم السلطاني رقم ٢٨ / ٢٠٠٩",
  },
  {
    slug: "personal-data",
    url: "https://qanoon.om/p/2022/l2022006/",
    titleAr: "قانون حماية البيانات الشخصية",
    titleEn: "Personal Data Protection Law",
    year: 2022,
    categoryAr: "بيانات",
    categoryEn: "Data",
    summaryAr: "معالجة البيانات الشخصية وحقوق صاحب البيانات والتزامات المتحكم.",
    summaryEn: "Processing of personal data, data-subject rights, and controller duties.",
    decree: "المرسوم السلطاني رقم ٦ / ٢٠٢٢",
  },
  {
    slug: "traffic-law",
    url: "https://qanoon.om/p/1993/l1993028/",
    titleAr: "قانون المرور",
    titleEn: "Traffic Law",
    year: 1993,
    categoryAr: "مرور",
    categoryEn: "Traffic",
    summaryAr: "قواعد السير وترخيص المركبات والمخالفات المرورية.",
    summaryEn: "Road rules, vehicle licensing, and traffic offences.",
    decree: "المرسوم السلطاني رقم ٢٨ / ٩٣",
  },
  {
    slug: "vehicle-insurance",
    url: "https://qanoon.om/p/1994/l1994034/",
    titleAr: "قانون تأمين المركبات",
    titleEn: "Vehicle Insurance Law",
    year: 1994,
    categoryAr: "مرور",
    categoryEn: "Traffic",
    summaryAr: "التأمين الإلزامي على المركبات والمسؤولية عن حوادث السير.",
    summaryEn: "Compulsory vehicle insurance and liability for traffic accidents.",
    decree: "المرسوم السلطاني رقم ٣٤ / ٩٤",
  },
];

function decode(value) {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;|&#39;/g, "'");
}

function textOf(html) {
  return decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function articleNumber(raw) {
  const t = raw
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = t.match(/^(?:ال)?مادة\s*(?:رقم\s*)?(?:\(\s*([^)]+?)\s*\)\s*(.*)|([0-9٠-٩].*))$/);
  if (match) {
    if (match[1]) {
      const extra = (match[2] ?? "").replace(/\s+/g, " ").trim();
      if (extra && !/^مكرر/.test(extra)) return null;
      return extra ? `${match[1]} ${extra}`.trim() : match[1].trim();
    }
    const rest = match[3].replace(/\s+/g, " ").trim();
    if (rest.length > 40) return null;
    return rest;
  }
  const word = t.match(
    /^(?:ال)?مادة\s+(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة)\s*$/,
  );
  return word ? word[1] : null;
}

function isStructuralLine(line) {
  return /^(الكتاب|الباب|الفصل|الفرع)\b/.test(line);
}

function paragraphIsHeadingBlock(lines, centered) {
  if (!lines.length) return false;
  if (lines.every((line) => articleNumber(line) || isStructuralLine(line))) return true;
  if (!centered || lines.some((line) => line.length > 180)) return false;
  if (lines.some((line) => articleNumber(line) || isStructuralLine(line))) return true;
  return lines.length <= 4 && lines.every((line) => line.length < 140);
}

function headingKind(text) {
  if (/^الكتاب\b/.test(text)) return "book";
  if (/^الباب\b/.test(text)) return "bab";
  if (/^الفصل\b/.test(text)) return "fasl";
  if (/^الفرع\b/.test(text)) return "far";
  return "other";
}

function decreeRank(href) {
  const match = String(href).match(/\/(?:rd|l|mjla)(\d{4})(\d+)\//i);
  if (!match) return 0;
  return Number(match[1]) * 10000 + Number(match[2]);
}

function sliceEntry(html) {
  const start = html.indexOf('<div class="entry-content">');
  const end = html.indexOf("<!-- .entry-content -->");
  if (start < 0 || end < 0) throw new Error("entry-content not found");
  return html.slice(start, end);
}

function amendmentThrough(chunk) {
  const candidates = [];
  const header = chunk.match(
    /معدل لغاية:[\s\S]{0,800}?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
  );
  if (header) candidates.push({ href: header[1], text: textOf(header[2]) });
  for (const note of chunk.matchAll(
    /\[(\d+)\][\s\S]{0,220}?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    if (!/مرسوم|قانون/.test(note[3])) continue;
    candidates.push({ href: note[2], text: textOf(note[3]) });
  }
  if (!candidates.length) return "";
  candidates.sort((a, b) => decreeRank(a.href) - decreeRank(b.href));
  return candidates[candidates.length - 1].text.replace(/\s+/g, " ").trim();
}

function issuedLink(chunk) {
  const match = chunk.match(
    /صدر بموجب:[\s\S]{0,700}?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
  );
  if (!match) return null;
  return { href: match[1], text: textOf(match[2]).replace(/\s+/g, " ").trim() };
}

function latinDigits(value) {
  return String(value).replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
}

function articleKey(number) {
  return latinDigits(number).replace(/\s+/g, "").toLowerCase();
}

function firstNumeric(parsed) {
  for (const chapter of parsed.chapters) {
    for (const article of chapter.articles) {
      const value = Number(latinDigits(article.number).match(/\d+/)?.[0]);
      if (value) return value;
    }
  }
  return 0;
}

function overlayAmendments(base, amendment) {
  const incoming = new Map();
  for (const chapter of amendment.chapters) {
    for (const article of chapter.articles) {
      if (article.number === "ديباجة" || article.number === "حاشية") continue;
      incoming.set(articleKey(article.number), article);
    }
  }
  const used = new Set();
  for (const chapter of base.chapters) {
    for (const article of chapter.articles) {
      const newer = incoming.get(articleKey(article.number));
      if (!newer) continue;
      article.number = newer.number;
      article.body = newer.body;
      used.add(articleKey(article.number));
    }
  }
  const extra = [...incoming.entries()].filter(([key]) => !used.has(key)).map(([, article]) => article);
  if (extra.length) {
    base.chapters.push({
      title: "مواد مضافة في النص المجمّع",
      articles: extra,
    });
  }
  const notes = amendment.chapters.find((chapter) => chapter.title.startsWith("حاشية"));
  if (notes) base.chapters.push(notes);
  return base;
}

function issuedDecree(chunk) {
  const match = chunk.match(/صدر بموجب:[\s\S]{0,700}?<a[^>]*>([\s\S]*?)<\/a>/i);
  return match ? textOf(match[1]).replace(/\s+/g, " ").trim() : "";
}

function parseLaw(html) {
  const chunk = sliceEntry(html);
  const issued = issuedDecree(chunk);
  const issuedHref = issuedLink(chunk)?.href ?? "";
  const amended = amendmentThrough(chunk);
  let body = chunk.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) => {
      const cells = [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
        textOf(cell[1]).replace(/\s+/g, " ").trim(),
      );
      return cells.filter(Boolean).join(" — ");
    });
    return `<p>${rows.filter(Boolean).join("\n")}</p>`;
  });

  const book = { book: "", bab: "", fasl: "", far: "", other: "" };
  const chapters = [];
  let currentTitle = "";
  let current = null;
  let article = null;
  const footnotes = [];

  const ensure = () => {
    const title = [book.book, book.bab, book.fasl, book.far, book.other].filter(Boolean).join(" — ") || "النص";
    if (!current || current.title !== title) {
      current = { title, articles: [] };
      chapters.push(current);
      currentTitle = title;
    }
    return current;
  };

  const applyHeading = (line) => {
    const number = articleNumber(line);
    if (number) {
      const chapter = ensure();
      article = { number, body: "" };
      chapter.articles.push(article);
      return;
    }
    const kind = headingKind(line);
    if (kind === "book") Object.assign(book, { book: line, bab: "", fasl: "", far: "", other: "" });
    else if (kind === "bab") Object.assign(book, { bab: line, fasl: "", far: "", other: "" });
    else if (kind === "fasl") Object.assign(book, { fasl: line, far: "", other: "" });
    else if (kind === "far") Object.assign(book, { far: line, other: "" });
    else book.other = line;
    article = null;
  };

  const pushParagraph = (paragraph) => {
    if (!paragraph) return;
    if (/^صدر بموجب|^معدل لغاية/.test(paragraph)) return;
    if (/^(تحميل|english|عربي)$/i.test(paragraph)) return;
    if (/^\[\d+\]/.test(paragraph)) {
      footnotes.push(paragraph);
      article = null;
      return;
    }
    if (!article) {
      const preamble = ensure();
      let lead = preamble.articles.find((item) => item.number === "ديباجة");
      if (!lead) {
        lead = { number: "ديباجة", body: "" };
        preamble.articles.push(lead);
      }
      lead.body = lead.body ? `${lead.body}\n\n${paragraph}` : paragraph;
      return;
    }
    article.body = article.body ? `${article.body}\n\n${paragraph}` : paragraph;
  };

  for (const match of body.matchAll(/<(h[2-4]|p|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? "";
    const text = textOf(match[3]);
    if (!text) continue;
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const centered = /text-align:\s*center/i.test(attrs);
    if (tag.startsWith("h") || paragraphIsHeadingBlock(lines, centered)) {
      for (const line of lines) applyHeading(line.replace(/\s+/g, " ").trim());
      continue;
    }
    for (const line of lines) pushParagraph(line);
  }

  if (footnotes.length) {
    chapters.push({
      title: "حاشية التعديلات في المصدر",
      articles: [{ number: "حاشية", body: footnotes.join("\n\n") }],
    });
  }

  const cleaned = chapters
    .map((chapter) => ({
      title: chapter.title,
      articles: chapter.articles.filter((item) => item.body.trim().length > 0),
    }))
    .filter((chapter) => chapter.articles.length > 0);

  return { issued, issuedHref, amended, chapters: cleaned, unusedTitle: currentTitle };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "LegalOfficeAI/1.0 (law library import; +https://legal-office-web.vercel.app/laws)",
      accept: "text/html",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function catalogItem(meta, law) {
  const count = law.chapters.reduce((sum, chapter) => sum + chapter.articles.length, 0);
  return {
    slug: meta.slug,
    titleAr: meta.titleAr,
    titleEn: meta.titleEn,
    decree: law.decree,
    year: meta.year,
    categoryAr: meta.categoryAr,
    categoryEn: meta.categoryEn,
    summaryAr: meta.summaryAr,
    summaryEn: meta.summaryEn,
    sourceUrl: meta.url,
    ...(law.amendedThrough ? { amendedThrough: law.amendedThrough } : {}),
    articleCount: count,
  };
}

function writeLoader(slugs) {
  const imports = slugs
    .map((slug, index) => `import law${index} from "./corpus/${slug}.json";`)
    .join("\n");
  const entries = slugs
    .map((slug, index) => `  "${slug}": law${index} as OmanLaw,`)
    .join("\n");
  return `import type { OmanLaw } from "./types";
${imports}

const BY_SLUG: Record<string, OmanLaw> = {
${entries}
};

export function getLawBySlug(slug: string): OmanLaw | null {
  return BY_SLUG[slug] ?? null;
}
`;
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

await mkdir(corpusDir, { recursive: true });

const built = await mapPool(LAWS, 3, async (meta) => {
  const html = await fetchHtml(meta.url);
  const h1 = textOf(html.match(/<h1 class="entry-title">([\s\S]*?)<\/h1>/)?.[1] ?? "");
  let parsed = parseLaw(html);
  const startsAt = firstNumeric(parsed);
  let merged = false;
  if (parsed.issuedHref && parsed.issuedHref !== meta.url && startsAt > 5) {
    const issuedText = parsed.issued;
    const amended = parsed.amended;
    const base = parseLaw(await fetchHtml(parsed.issuedHref));
    parsed = overlayAmendments(base, parsed);
    parsed.amended = amended || base.amended;
    parsed.issued = issuedText || base.issued;
    merged = true;
  }
  const count = parsed.chapters.reduce((sum, chapter) => sum + chapter.articles.length, 0);
  const min = meta.minArticles ?? 8;
  if (count < min) {
    return { meta, skipped: true, count, h1 };
  }
  const amended =
    parsed.amended && parsed.amended !== parsed.issued ? parsed.amended : undefined;
  const law = {
    slug: meta.slug,
    titleAr: meta.titleAr,
    titleEn: meta.titleEn,
    decree: parsed.issued || meta.decree || h1,
    year: meta.year,
    categoryAr: meta.categoryAr,
    categoryEn: meta.categoryEn,
    summaryAr: meta.summaryAr,
    summaryEn: meta.summaryEn,
    sourceUrl: meta.url,
    ...(amended ? { amendedThrough: amended } : {}),
    ...(merged
      ? {
          sourceNoteAr:
            "النص الكامل مأخوذ من مرسوم الإصدار، وأُدخلت فيه المواد المعدلة المنشورة في صفحة التجميع على المصدر.",
          sourceNoteEn:
            "The full text is taken from the issuing decree, with amended articles from the consolidated source page inserted.",
        }
      : {}),
    chapters: parsed.chapters,
  };
  await writeFile(path.join(corpusDir, `${meta.slug}.json`), `${JSON.stringify(law)}\n`, "utf8");
  return { meta, law, count, h1 };
});

const kept = built.filter((item) => item.law);
const skipped = built.filter((item) => item.skipped);
const catalog = kept.map((item) => catalogItem(item.meta, item.law));
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await writeFile(loaderPath, writeLoader(kept.map((item) => item.meta.slug)), "utf8");

for (const item of kept) {
  console.log(`OK  ${String(item.count).padStart(4)}  ${item.meta.slug}  ${item.h1}`);
}
for (const item of skipped) {
  console.log(`SKIP ${String(item.count).padStart(4)}  ${item.meta.slug}  ${item.h1}`);
}
console.log(`wrote ${kept.length} laws, skipped ${skipped.length}`);
