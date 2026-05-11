-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "main_code" VARCHAR(25) NOT NULL,
    "aux_code" VARCHAR(25),
    "description" TEXT NOT NULL,
    "unit_price" DECIMAL(14,6) NOT NULL,
    "tax_option" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
