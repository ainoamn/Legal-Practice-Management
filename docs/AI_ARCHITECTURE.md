# AI architecture — planned, disabled

Provider interface: generate, embed, usage; tenant opt-in and model/task configuration with encrypted secret references. No provider calls or AI buttons until integration is implemented and tested. Keys never enter public Next environment. Missing keys return a typed disabled capability, never synthetic legal output.

Pipeline: private upload → malware quarantine → extraction/OCR job → page/source attribution → human quality flag → chunks → embeddings in pgvector → ACL-filtered retrieval → generated answer with exact document/page references → usage ledger and human review. Every job carries trusted tenant/user/document IDs and reauthorizes before executing and before displaying its output. Deleted/restricted files must leave retrieval indexes under retention policy.

Prompt boundary treats document text as untrusted data. Retrieved instructions cannot select tools, change scope, access secrets or make external calls. Answer must distinguish file facts from inference and say when unsupported. Legal citations require verified sources; no invented court rulings or provisions. Drafts remain unapproved until an authorized human approves an immutable version. No filing, official sending or deadline creation by model assertion.

External provider, OCR, vector search, billing quotas and evaluation corpus are pending. Tests require provider mocks, real opt-in integration tests before activation, injection corpus, citation accuracy and cross-tenant/record negative tests. Court-outcome prediction stays disabled until legally/statistically validated data exists.
