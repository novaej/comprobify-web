-- Email verification is a fact about the tenant (tenant.status at the API),
-- not any one login — this column was an unreliable local mirror, matched by
-- comparing emails that don't always agree between the two systems.

-- AlterTable
ALTER TABLE "users" DROP COLUMN "email_verified";
