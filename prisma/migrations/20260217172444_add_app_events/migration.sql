-- CreateTable
CREATE TABLE "app_events" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_events_slug_key" ON "app_events"("slug");
