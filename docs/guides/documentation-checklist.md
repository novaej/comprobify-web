# Documentation Checklist

When making changes to `comprobify-web`, update the corresponding documentation places listed below.

---

## By Change Type

### Adding a New Screen

**Code files:**
- ✅ `src/app/[locale]/your-screen/page.tsx` — page component
- ✅ `src/app/[locale]/your-screen/actions.ts` — Server Actions (mutations)
- ✅ `src/components/` — Client Components used by the screen
- ✅ `src/components/nav.tsx` — add nav link if the screen is top-level

**Documentation files:**
1. **`messages/es.json`** — add all new translation keys
2. **`messages/en.json`** — mirror all keys from es.json
3. **`docs/site/screens/{screen-name}.md`** — create or update screen spec
4. **`CHANGELOG.md`** — add to "### Added" in Unreleased
5. **`NEXT_STEPS.md`** — remove the item if it was tracked there

**Checklist:**
- [ ] es.json updated
- [ ] en.json updated (in sync)
- [ ] Screen spec created/updated
- [ ] CHANGELOG updated
- [ ] NEXT_STEPS updated

---

### Adding a Server Action

**Code files:**
- ✅ `src/app/[locale]/screen/actions.ts` — add `'use server'` function
- ✅ Calling component updated

**Documentation files:**
1. **`messages/es.json`** / **`en.json`** — add error message keys if new API errors are surfaced
2. **`CHANGELOG.md`** — add to "### Added" in Unreleased

**Checklist:**
- [ ] Action has `'use server'` at the top
- [ ] ApiError is caught and returned as `{ error: error.code }`
- [ ] New API error codes added to `apiError` namespace in both message files
- [ ] CHANGELOG updated

---

### Adding a Comprobify API Call

**Code files:**
- ✅ `src/lib/api.ts` — add typed function + TypeScript interfaces

**Documentation files:**
1. **`CHANGELOG.md`** — add to "### Added" in Unreleased
2. **`docs/site/screens/`** — update any screen spec that uses the new call

**Pre-coding verification** (do this before writing any TypeScript):

1. Open `../comprobify/src/routes/` — confirm the HTTP method and path are correct.
2. Open `../comprobify/src/controllers/` — find the relevant `res.json(...)` call and read the exact keys it sends.
3. Follow every referenced service or presenter function and trace each field back to what is actually returned — do not assume from the function name.
4. Check whether the route uses `resolveIssuer` middleware (→ requires `X-Issuer-Id` / `issuerId` in `ApiCtx`) or only `authenticate` (no issuer needed).

**Checklist:**
- [ ] Route confirmed in `../comprobify/src/routes/` (method + path)
- [ ] Response shape read from the controller's `res.json()` call
- [ ] Every interface field traced to the service/presenter return statement
- [ ] `id` and all `*_id` fields typed as `string` (the API is UUID-keyed throughout)
- [ ] No `Number()` applied to any API id — it yields `NaN` (see ADR-007)
- [ ] Field names match exactly (e.g. `active` not `isActive`, `apiKey` not `key`)
- [ ] If `POST` omits `id`: follow-up `GET` implemented to retrieve metadata
- [ ] Function is in `src/lib/api.ts` (never called from client components)
- [ ] Comment added: `// Verified against: ../comprobify/src/controllers/X.controller.js → method()`
- [ ] CHANGELOG updated

See `docs/guides/coding-guidelines.md → "Adding a new API endpoint call"` for the full step-by-step guide with examples.

---

### Modifying a Screen

**Code files:**
- ✅ Update page, actions, or components

**Documentation files:**
1. **`messages/es.json`** / **`en.json`** — update keys if labels changed
2. **`docs/site/screens/{screen-name}.md`** — update spec if design intent changed
3. **`CHANGELOG.md`** — add to "### Changed" in Unreleased

**Checklist:**
- [ ] Both message files updated (if strings changed)
- [ ] Screen spec updated
- [ ] CHANGELOG updated

---

### Adding a New Translation Key

**Code files:**
- ✅ Add the key to the component (via `t('key')`)

**Documentation files:**
1. **`messages/es.json`** — add key with Spanish value
2. **`messages/en.json`** — add key with English value

**Rule:** Always add to both files in the same commit. A missing key in either file causes a runtime error in development and a silent fallback in production.

---

### Adding/Updating Configuration (env var)

**Documentation files:**
1. **`.example.env`** — add env var with comment explaining purpose
2. **`GETTING_STARTED.md`** — add setup instructions if user must configure it
3. **`CLAUDE.md`** — update Key Files if the config enables a significant pattern
4. **`CHANGELOG.md`** — add to "### Added" in Unreleased

---

### Fixing a Bug

**Documentation files:**
1. **`CHANGELOG.md`** — add to "### Fixed" in Unreleased
2. **`CLAUDE.md`** — update "Common Mistakes to Avoid" if it prevents the bug recurring

---

### Architecture Decision

**Documentation files:**
1. **`docs/adr/NNN-decision-name.md`** — create new ADR (increment number)
2. **`CLAUDE.md`** — update Key Patterns if the decision introduces a new pattern

---

## Documentation Files Master List

| File | Purpose | Update When |
|------|---------|-------------|
| `messages/es.json` | Spanish translations | Any visible string change |
| `messages/en.json` | English translations | Same time as es.json |
| `docs/site/screens/{name}.md` | Screen design spec | Adding or modifying a screen |
| `docs/site/architecture/{topic}.md` | Architecture docs | Significant architecture change |
| `docs/adr/{NNN}-{name}.md` | Architecture decisions | New architecture decision |
| `docs/guides/code-flow.md` | Request lifecycle walkthrough | Changing how requests flow |
| `docs/guides/coding-guidelines.md` | How to build features | New pattern or convention |
| `docs/guides/encryption-key-rotation.md` | How to rotate `ENCRYPTION_KEY` via `scripts/rotate-encryption-key.js` | The set of columns encrypted with `ENCRYPTION_KEY` changes, or `src/lib/crypto.ts`'s format changes |
| `docs/guides/database-backups.md` | Pulling an importable dump of this app's own database | Cluster/Trusted-Sources setup changes, or a table gains row-level security |
| `docs/guides/payphone-payments.md` | Card payments (ADR-028) — frontend flow, environment setup, troubleshooting | The widget/session/return-page flow changes, or a new Payphone-configured environment is added |
| `CLAUDE.md` | Rules for AI assistants | Architecture or pattern change |
| `CHANGELOG.md` | Release history | Every code change |
| `NEXT_STEPS.md` | Pending features | Completing a feature |
| `.example.env` | Environment template | Adding any env var |
| `GETTING_STARTED.md` | Local setup guide | Adding required setup steps |
| `README.md` | Project overview | Significant changes to purpose or stack |

---

## Quick Reference

### `CLAUDE.md` — Update For:
- New architectural rule or constraint
- New pattern (Key Patterns section)
- New important file (Key Files section)
- New common mistake discovered

### `CHANGELOG.md` — Update For:
- Every code change (at least Added/Changed/Fixed)
- Use imperative mood: "Add dashboard page", not "Added dashboard page"

### `NEXT_STEPS.md` — Update For:
- Completing a tracked feature (remove it)
- Discovering a new required feature (add it)
