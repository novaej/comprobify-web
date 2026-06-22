-- CreateTable
CREATE TABLE "document_templates" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "document_type" VARCHAR(2) NOT NULL DEFAULT '01',
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_templates_tenant_id_document_type_idx" ON "document_templates"("tenant_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_tenant_id_document_type_name_key" ON "document_templates"("tenant_id", "document_type", "name");

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
