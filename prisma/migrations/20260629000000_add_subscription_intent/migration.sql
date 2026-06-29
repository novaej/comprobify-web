-- RenameColumn
ALTER TABLE "tenants" RENAME COLUMN "tier" TO "intended_tier";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "intended_billing_interval" TEXT,
ADD COLUMN     "pending_bank_transfer" JSONB;
