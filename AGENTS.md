<!-- BEGIN:rls-rules -->
# Database access is Row-Level Security, fail-closed

Never query a tenant-owned table directly. Use `withTenant(tenantId, tx => ...)` or, for the few genuinely cross-tenant paths, `asSystem(reason, tx => ...)` from `src/lib/db.ts`. A query outside a wrapper sees zero rows and cannot insert. The exported `db` only exposes `user`, `tenant`, `verificationToken` and `agreementDraft`; a relation load from one of those into a protected table (`include: { issuerAccess }`, `_count: { issuers }`) must also run inside a wrapper. Read ADR-010 (`docs/adr/010-row-level-security.md`) and CLAUDE.md rule 12 before touching `src/lib/db.ts` or adding a table.
<!-- END:rls-rules -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
