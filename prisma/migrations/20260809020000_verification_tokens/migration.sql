-- Generic single-use token table — see src/lib/verification-token.ts.
-- Replaces User's hand-rolled password-reset-only token columns.

CREATE TABLE "verification_tokens" (
  "id"          UUID PRIMARY KEY,
  "user_id"     UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "purpose"     TEXT NOT NULL,
  "token_hash"  TEXT NOT NULL UNIQUE,
  "expires_at"  TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "verification_tokens_user_id_purpose_idx"
  ON "verification_tokens" ("user_id", "purpose");

-- Carry over any in-flight password reset so its link keeps working.
INSERT INTO "verification_tokens" (id, user_id, purpose, token_hash, expires_at)
SELECT gen_random_uuid(), id, 'PASSWORD_RESET', "password_reset_token_hash", "password_reset_token_expires_at"
FROM "users"
WHERE "password_reset_token_hash" IS NOT NULL
  AND "password_reset_token_expires_at" IS NOT NULL;

ALTER TABLE "users"
  DROP COLUMN "password_reset_token_hash",
  DROP COLUMN "password_reset_token_expires_at";
