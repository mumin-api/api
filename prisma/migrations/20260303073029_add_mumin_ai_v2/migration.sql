-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "hadith_explanations" (
    "id" SERIAL NOT NULL,
    "hadith_id" INTEGER NOT NULL,
    "language_code" VARCHAR(5) NOT NULL,
    "content" JSONB NOT NULL,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'openai',
    "model" VARCHAR(50) NOT NULL,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hadith_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explanation_feedback" (
    "id" SERIAL NOT NULL,
    "explanation_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "message" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explanation_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hadith_explanations_hadith_id_idx" ON "hadith_explanations"("hadith_id");

-- CreateIndex
CREATE INDEX "hadith_explanations_language_code_idx" ON "hadith_explanations"("language_code");

-- CreateIndex
CREATE UNIQUE INDEX "hadith_explanations_hadith_id_language_code_key" ON "hadith_explanations"("hadith_id", "language_code");

-- CreateIndex
CREATE INDEX "explanation_feedback_explanation_id_idx" ON "explanation_feedback"("explanation_id");

-- CreateIndex
CREATE INDEX "explanation_feedback_status_idx" ON "explanation_feedback"("status");

-- AddForeignKey
ALTER TABLE "hadith_explanations" ADD CONSTRAINT "hadith_explanations_hadith_id_fkey" FOREIGN KEY ("hadith_id") REFERENCES "hadiths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explanation_feedback" ADD CONSTRAINT "explanation_feedback_explanation_id_fkey" FOREIGN KEY ("explanation_id") REFERENCES "hadith_explanations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explanation_feedback" ADD CONSTRAINT "explanation_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
