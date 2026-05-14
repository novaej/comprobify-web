-- CreateTable
CREATE TABLE "tenants" (
    "id" SERIAL NOT NULL,
    "api_tenant_id" INTEGER NOT NULL,
    "ruc" VARCHAR(13) NOT NULL,
    "business_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tier" TEXT,
    "contact_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "tenant_id" INTEGER,
    "role" TEXT,
    "invite_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "invited_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_api_keys" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "api_key_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "last_four" VARCHAR(4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "tenant_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issuers" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "api_issuer_id" INTEGER NOT NULL,
    "branch_code" VARCHAR(3) NOT NULL,
    "issue_point_code" VARCHAR(3) NOT NULL,
    "business_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "branch_address" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issuers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_issuer_access" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "issuer_id" INTEGER NOT NULL,

    CONSTRAINT "user_issuer_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "main_code" VARCHAR(25) NOT NULL,
    "aux_code" VARCHAR(25),
    "description" TEXT NOT NULL,
    "unit_price" DECIMAL(14,6) NOT NULL,
    "tax_option" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "id_type" VARCHAR(5) NOT NULL,
    "id_number" VARCHAR(20) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_api_tenant_id_key" ON "tenants"("api_tenant_id");
CREATE UNIQUE INDEX "tenants_ruc_key" ON "tenants"("ruc");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_tenant_id_role_idx" ON "users"("tenant_id", "role");
CREATE UNIQUE INDEX "tenant_api_keys_api_key_id_key" ON "tenant_api_keys"("api_key_id");
CREATE INDEX "tenant_api_keys_tenant_id_is_active_idx" ON "tenant_api_keys"("tenant_id", "is_active");
CREATE UNIQUE INDEX "issuers_api_issuer_id_key" ON "issuers"("api_issuer_id");
CREATE UNIQUE INDEX "issuers_tenant_id_branch_code_issue_point_code_key" ON "issuers"("tenant_id", "branch_code", "issue_point_code");
CREATE INDEX "issuers_tenant_id_idx" ON "issuers"("tenant_id");
CREATE UNIQUE INDEX "user_issuer_access_user_id_issuer_id_key" ON "user_issuer_access"("user_id", "issuer_id");
CREATE INDEX "user_issuer_access_user_id_tenant_id_idx" ON "user_issuer_access"("user_id", "tenant_id");
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");
CREATE INDEX "clients_tenant_id_idx" ON "clients"("tenant_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issuers" ADD CONSTRAINT "issuers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_issuer_access" ADD CONSTRAINT "user_issuer_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_issuer_access" ADD CONSTRAINT "user_issuer_access_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_issuer_access" ADD CONSTRAINT "user_issuer_access_issuer_id_fkey" FOREIGN KEY ("issuer_id") REFERENCES "issuers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
