-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "first_name" TEXT,
  ADD COLUMN "last_name"  TEXT,
  ADD COLUMN "active"     BOOLEAN NOT NULL DEFAULT true;
