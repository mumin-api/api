-- CreateTable
CREATE TABLE "collections" (
    "id" SERIAL NOT NULL,
    "name_english" VARCHAR(100) NOT NULL,
    "name_arabic" VARCHAR(100),
    "slug" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "total_hadith" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hadiths" (
    "id" SERIAL NOT NULL,
    "collection" VARCHAR(50) NOT NULL,
    "collection_id" INTEGER,
    "book_number" INTEGER NOT NULL,
    "hadith_number" INTEGER NOT NULL,
    "arabic_text" TEXT NOT NULL,
    "arabic_narrator" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hadiths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" SERIAL NOT NULL,
    "hadith_id" INTEGER NOT NULL,
    "language_code" VARCHAR(5) NOT NULL,
    "text" TEXT NOT NULL,
    "narrator" VARCHAR(255),
    "grade" VARCHAR(50),
    "translator" VARCHAR(100),

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_prefix" VARCHAR(20) NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "total_requests" INTEGER NOT NULL DEFAULT 0,
    "total_data_transferred" BIGINT NOT NULL DEFAULT 0,
    "user_email" VARCHAR(255),
    "user_metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "suspended_at" TIMESTAMP(3),
    "suspend_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "last_activity_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terms_accepted_at" TIMESTAMP(3),
    "terms_version" VARCHAR(10),
    "privacy_policy_accepted_at" TIMESTAMP(3),
    "privacy_policy_version" VARCHAR(10),
    "cookie_consent" JSONB,
    "ip_at_registration" VARCHAR(45),
    "user_agent_at_registration" TEXT,
    "device_fingerprint_at_reg" VARCHAR(64),
    "geo_location_at_reg" VARCHAR(100),
    "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "fraud_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_daily_requests" INTEGER NOT NULL DEFAULT 500,
    "inactivity_warnings" INTEGER NOT NULL DEFAULT 0,
    "dormant_at" TIMESTAMP(3),
    "allowed_ips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "webhook_url" VARCHAR(500),
    "notes" TEXT,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_logs" (
    "id" SERIAL NOT NULL,
    "api_key_id" INTEGER,
    "endpoint" VARCHAR(255) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "request_body" JSONB,
    "request_headers" JSONB,
    "query_params" JSONB,
    "response_status" INTEGER,
    "response_body" JSONB,
    "response_time_ms" INTEGER,
    "data_transferred" INTEGER,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "device_fingerprint" VARCHAR(64),
    "geo_location" VARCHAR(100),
    "was_from_cache" BOOLEAN NOT NULL DEFAULT false,
    "cache_key" VARCHAR(255),
    "billing_impact" INTEGER NOT NULL DEFAULT 1,
    "request_id" VARCHAR(36) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "api_key_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "payment_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "api_key_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "credits" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "chargeback_status" TEXT,
    "chargeback_reason" TEXT,
    "dispute_evidence_url" TEXT,
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "device_fingerprint" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" SERIAL NOT NULL,
    "api_key_id" INTEGER NOT NULL,
    "email_type" TEXT NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "subject" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "bounced" BOOLEAN NOT NULL DEFAULT false,
    "bounce_reason" TEXT,
    "message_id" VARCHAR(255) NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "metadata" JSONB,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_events" (
    "id" SERIAL NOT NULL,
    "api_key_id" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "action_taken" TEXT,
    "ip_address" VARCHAR(45),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" SERIAL NOT NULL,
    "admin_key_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "target_key_id" INTEGER,
    "details" JSONB,
    "ip_address" VARCHAR(45),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_requests" (
    "id" SERIAL NOT NULL,
    "api_key_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "download_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "file_size" INTEGER,
    "format" TEXT NOT NULL DEFAULT 'json',

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" SERIAL NOT NULL,
    "api_key_id" INTEGER NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "confirmation_token" VARCHAR(64) NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endpoint_stats" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "endpoint" VARCHAR(255) NOT NULL,
    "total_hits" INTEGER NOT NULL DEFAULT 0,
    "unique_users" INTEGER NOT NULL DEFAULT 0,
    "avg_response_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cache_hit_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "endpoint_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_stats" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "unique_users" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "geo_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE INDEX "hadiths_collection_idx" ON "hadiths"("collection");

-- CreateIndex
CREATE INDEX "hadiths_collection_id_idx" ON "hadiths"("collection_id");

-- CreateIndex
CREATE INDEX "hadiths_book_number_idx" ON "hadiths"("book_number");

-- CreateIndex
CREATE UNIQUE INDEX "hadiths_collection_book_number_hadith_number_key" ON "hadiths"("collection", "book_number", "hadith_number");

-- CreateIndex
CREATE INDEX "translations_language_code_idx" ON "translations"("language_code");

-- CreateIndex
CREATE INDEX "translations_hadith_id_idx" ON "translations"("hadith_id");

-- CreateIndex
CREATE UNIQUE INDEX "translations_hadith_id_language_code_key" ON "translations"("hadith_id", "language_code");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_user_email_idx" ON "api_keys"("user_email");

-- CreateIndex
CREATE INDEX "api_keys_is_active_idx" ON "api_keys"("is_active");

-- CreateIndex
CREATE INDEX "api_keys_created_at_idx" ON "api_keys"("created_at");

-- CreateIndex
CREATE INDEX "api_keys_last_activity_date_idx" ON "api_keys"("last_activity_date");

-- CreateIndex
CREATE INDEX "request_logs_api_key_id_idx" ON "request_logs"("api_key_id");

-- CreateIndex
CREATE INDEX "request_logs_timestamp_idx" ON "request_logs"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "request_logs_endpoint_idx" ON "request_logs"("endpoint");

-- CreateIndex
CREATE INDEX "request_logs_ip_address_idx" ON "request_logs"("ip_address");

-- CreateIndex
CREATE INDEX "request_logs_request_id_idx" ON "request_logs"("request_id");

-- CreateIndex
CREATE INDEX "transactions_api_key_id_idx" ON "transactions"("api_key_id");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_api_key_id_idx" ON "payments"("api_key_id");

-- CreateIndex
CREATE INDEX "payments_provider_idx" ON "payments"("provider");

-- CreateIndex
CREATE INDEX "payments_provider_payment_id_idx" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_message_id_key" ON "email_logs"("message_id");

-- CreateIndex
CREATE INDEX "email_logs_api_key_id_idx" ON "email_logs"("api_key_id");

-- CreateIndex
CREATE INDEX "email_logs_email_type_idx" ON "email_logs"("email_type");

-- CreateIndex
CREATE INDEX "email_logs_sent_at_idx" ON "email_logs"("sent_at");

-- CreateIndex
CREATE INDEX "email_logs_provider_idx" ON "email_logs"("provider");

-- CreateIndex
CREATE INDEX "fraud_events_api_key_id_idx" ON "fraud_events"("api_key_id");

-- CreateIndex
CREATE INDEX "fraud_events_event_type_idx" ON "fraud_events"("event_type");

-- CreateIndex
CREATE INDEX "fraud_events_severity_idx" ON "fraud_events"("severity");

-- CreateIndex
CREATE INDEX "fraud_events_timestamp_idx" ON "fraud_events"("timestamp");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_key_id_idx" ON "admin_audit_logs"("admin_key_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_key_id_idx" ON "admin_audit_logs"("target_key_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_timestamp_idx" ON "admin_audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "data_export_requests_api_key_id_idx" ON "data_export_requests"("api_key_id");

-- CreateIndex
CREATE INDEX "data_export_requests_status_idx" ON "data_export_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "account_deletion_requests_confirmation_token_key" ON "account_deletion_requests"("confirmation_token");

-- CreateIndex
CREATE INDEX "account_deletion_requests_api_key_id_idx" ON "account_deletion_requests"("api_key_id");

-- CreateIndex
CREATE INDEX "account_deletion_requests_scheduled_for_idx" ON "account_deletion_requests"("scheduled_for");

-- CreateIndex
CREATE INDEX "endpoint_stats_date_idx" ON "endpoint_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "endpoint_stats_date_endpoint_key" ON "endpoint_stats"("date", "endpoint");

-- CreateIndex
CREATE INDEX "geo_stats_date_idx" ON "geo_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "geo_stats_date_country_key" ON "geo_stats"("date", "country");

-- AddForeignKey
ALTER TABLE "hadiths" ADD CONSTRAINT "hadiths_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_hadith_id_fkey" FOREIGN KEY ("hadith_id") REFERENCES "hadiths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_events" ADD CONSTRAINT "fraud_events_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
