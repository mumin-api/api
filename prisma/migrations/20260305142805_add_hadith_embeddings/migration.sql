-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "hadiths" ADD COLUMN     "embedding" vector(768);
