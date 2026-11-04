# Implemented legal operations and remaining scope

## Legal core

`/api/v1/practice`: clients, courts, matters, assignments, parties, internal notes, hearings, preparation tasks, reminders, tasks, scoped dashboard and conflict search. The workspace sidebar exposes these real records under Legal practice. Client identity/registration numbers are unique within a firm. Matter references are allocated under a tenant transaction lock. Optimistic versions reject lost edits. Matter and storage quotas are enforced, and plan changes cannot lower limits below measured usage.

Database RLS restricts matters to all-firm grants, the creator, explicit assignments, or non-confidential same-branch grants. Child rows inherit matter access. Composite foreign keys reject cross-firm references. Conflict results contain authorized records only; no-match is not a firm-wide conflict clearance. Matter events and notes are append-only for the runtime. Hearing overlaps are checked without exposing another case's contents. Notifications are persisted in-app reminders; email/SMS delivery is not implemented for these notifications.

Not complete: multiple linked primary clients, configurable numbering, taxonomy/workflow administration, advanced court litigation/execution flows, professional staff profiles, full branch administration, recurring tasks, configurable week starts and external calendar synchronization. The separate Calendar console now provides day/week/month views and a task-state board; Legal practice also keeps its paginated hearing list. Do not describe the whole legal phase as literally complete.

## Documents

Documents currently belong to matters. Private S3 objects have random tenant-prefixed keys and are never public. Uploads accept PDF, DOCX, XLSX, PPTX, JPEG, PNG, TIFF and UTF-8 text up to 25 MiB with signature checks. BullMQ schedules scanning and extraction. Pending/processing metadata supports reconciliation after an enqueue failure or restart. Only scan-ready versions may be downloaded. Download and export are authorized and audited server requests, with no permanent public object URLs.

ClamAV scans bytes through stdin before extraction writes a temporary file. Scanner failure denies download; detected malware is rejected. Archive-scan limits alert rather than silently treating a partially scanned archive as clean. Tesseract uses Arabic and English. Poppler extracts PDF text from up to 50 pages; scanned PDFs rasterize up to 20 pages. OCR results always require human review, and the UI warns about errors and omitted pages. DOCX uses text extraction. XLSX/PPTX currently have malware scanning and file download, not text extraction.

Versions preserve original file identity and hash. Human review precedes approval; approved text and completed historical versions are immutable, including after a new draft is created. A new version revokes approval and client visibility. Every retained object, including rejected files, counts toward storage. Templates support office/matter variables. PDF and DOCX exports, PDF print preview, side-by-side text comparison, tags/content search, archive, multiple upload, drag/drop and failed-file retry work. Arabic PDF output was rendered and inspected, and mixed-direction reference formatting was corrected.

Not complete: a full rich-text legal editor (tables, footnotes, tracked changes and full layout fidelity), independent client/contract document uploads outside a matter, folder upload, file-specific grants beyond matter grants, scanned-file inline previews, document request upload intake, and production retention/legal hold policies. Approval is an internal workflow, not a certified electronic signature.

## Contracts, powers of attorney and licences

`/api/v1/instruments` and the bilingual Instruments console support independent client records, contract parties, agent/issuing authority and external reference, issue/start/expiry/renewal dates, category, terms, internal notes, confidentiality and responsibility. Each firm has immutable sequential references. Values use exact decimal minor-unit strings up to 20 digits; Arabic and Persian digits are accepted by the UI without floating-point rounding. Currency precision is captured on each record and obligation.

Read/manage/approve are separate grants. Forced SQL RLS enforces firm, creator, responsible member, linked-matter and permitted branch scope; knowing an ID does not bypass scope. The platform principal receives aggregate counts only. Cross-client matter/document links are rejected in service and SQL. Concurrent edits require the latest version. Metadata edits return an approved record to draft and clear approval; closing/archiving keeps historical approval and its pinned source version.

If a source document is linked, approval requires its current reviewed, approved, scanned-ready version and pins that specific version. Later drafts do not silently replace that source. Downloads continue to require DMS grants and matter access. A linked document still belongs to a matter; independent source-file uploads and a certified signature workflow remain pending.

Personal expiry/renewal reminders are scheduled at 09:00 in the firm's timezone. An already-past expiry produces a current reminder. Reassignment, draft/closed state and completed obligations cancel outstanding reminders while read history remains. Obligations track due date, responsible member, amount and completion without posting a financial payment. Reminders are in-app; outbound email/SMS is not implemented. Recorded expiry is a date calculation, not a legal opinion about continuing validity.

## Calendar and task board

The Calendar console adds daily, Monday-based weekly and six-row monthly views of hearings and task deadlines, office-time date boundaries, search, personal assignment filtering, cancellation visibility and task-state columns with persisted moves through the existing authorized task API. Events spanning midnight appear on each relevant day. Date-range requests use actual timezone boundaries, including 23/25-hour days, rather than a fixed offset. Selecting a day opens its daily view.

`/api/v1/practice/calendar` applies the same SQL matter scope as legal operations. It accepts a bounded window of at most 63 elapsed days and returns only scheduling fields and matter identity, without internal narratives. A result exceeding 2000 records is rejected with a request to narrow the window; it is never silently truncated. Hearing/meeting creation and detailed editing remain in Legal practice. Recurrence, drag-and-drop scheduling, configurable week starts, external calendar sync and outbound delivery remain pending.

## Firm finance

`/api/v1/finance`: exact minor-unit invoice amounts, quantity/discount/tax basis points, sequential invoices, issue/void draft, manual receipts, expense approval, client-fund deposits/disbursements, fee agreements, time entries, manual operating journals and reports. Firm invoices and accounting are separate from platform subscription invoices. Tax is explicitly entered by the firm; no unverified Oman tax rule is assumed.

Issuance posts receivables/revenue/tax. Receipts post operating cash/receivables. Expense approval is a combined approval and recording of an already-made operating cash disbursement, clearly labeled in the UI. Client funds have separate asset/liability accounts and cannot be spent below that client's balance. They do not count as revenue. Manual entries only use operating accounts. Deferred SQL constraints reject unbalanced journals and missing invoice/receipt/expense postings; posted history cannot be edited by the runtime. Transactions and tenant locks prevent simultaneous overcollection.

Accountants use billing directory projections containing client names/case references without internal case narratives or client notes. Reports expose trial balance, revenue/expense/net income, overdue outstanding invoices and client-fund balances. Fee agreements and time records do not automatically create invoices. Latest 100 fee/time records are currently shown.

Not complete: multi-line invoices, credit notes/refunds, bank reconciliation, accrual payables, chart editing, automated recurring billing, fee-stage billing, lawyer/matter profitability and full monthly/cash-flow report suites. Electronic payment gateways, verified webhooks and electronic receipts are not implemented. Separation in software does not establish compliance with professional client-money obligations.

## Client portal

`/portal` uses a client membership with only workspace/portal grants. Firm staff create that account through Team and explicitly link it from a client profile. Client logins redirect to the separate portal. Staff publish each matter separately. The portal receives explicit SQL projections, never complete ORM legal entities: no internal notes, case summary, next-step strategy, document keys or draft text.

Files require the current approved version, publication of both case and document, successful scanning and an active client link. New drafts and revoked links remove download access immediately. Published issued invoices show only that client's balance. Messages, appointment/contact/document requests and staff responses are stored and scoped per client. Appointments are requests, not confirmed court events. Contact changes are requests for staff review, not automatic identity edits.

Not complete: client upload intake, invitation email delivery/existing-account acceptance, document-request fulfillment automation, client notification delivery and full request pagination. These are not exposed as working controls.

## Verification boundaries

Live document tests use the isolated local S3 bucket, real ClamAV, Tesseract, Poppler and Chromium. Portal ACL tests use deterministic file fixtures to test authorization, separately from those live storage/scanner tests. All legal/finance/portal isolation tests use real PostgreSQL under the restricted app principal. Docker/CI configuration has been extended but its remote/container execution remains unverified. See PROJECT_STATUS.md for the latest completed checks and launch gates.
