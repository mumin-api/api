-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "allowed_origins" TEXT[] DEFAULT ARRAY[]::TEXT[];
