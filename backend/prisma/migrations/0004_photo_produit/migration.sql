-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "photoUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductPhoto" (
    "productId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPhoto_pkey" PRIMARY KEY ("productId")
);

-- AddForeignKey
ALTER TABLE "ProductPhoto" ADD CONSTRAINT "ProductPhoto_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
