-- CreateTable
CREATE TABLE "topics" (
    "id" SERIAL NOT NULL,
    "name_english" VARCHAR(100) NOT NULL,
    "name_arabic" VARCHAR(100),
    "slug" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hadith_topics" (
    "hadith_id" INTEGER NOT NULL,
    "topic_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hadith_topics_pkey" PRIMARY KEY ("hadith_id","topic_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");

-- CreateIndex
CREATE INDEX "hadith_topics_hadith_id_idx" ON "hadith_topics"("hadith_id");

-- CreateIndex
CREATE INDEX "hadith_topics_topic_id_idx" ON "hadith_topics"("topic_id");

-- AddForeignKey
ALTER TABLE "hadith_topics" ADD CONSTRAINT "hadith_topics_hadith_id_fkey" FOREIGN KEY ("hadith_id") REFERENCES "hadiths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hadith_topics" ADD CONSTRAINT "hadith_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
