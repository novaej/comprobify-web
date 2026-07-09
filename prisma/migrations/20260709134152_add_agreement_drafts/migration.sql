-- CreateTable
CREATE TABLE "agreement_drafts" (
    "id" SERIAL NOT NULL,
    "document_type" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreement_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agreement_drafts_document_type_key" ON "agreement_drafts"("document_type");
