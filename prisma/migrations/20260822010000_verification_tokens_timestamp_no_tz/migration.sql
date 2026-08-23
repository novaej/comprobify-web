-- verification_tokens' timestamp columns and its FK's ON UPDATE behavior were
-- hand-written as TIMESTAMPTZ / NO ACTION in 20260809020000_verification_tokens,
-- inconsistent with every other table in this schema (TIMESTAMP(3) / CASCADE).
-- No functional reason for the difference was found — standardizing here.

-- DropForeignKey
ALTER TABLE "verification_tokens" DROP CONSTRAINT "verification_tokens_user_id_fkey";

-- AlterTable
ALTER TABLE "verification_tokens" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "consumed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
