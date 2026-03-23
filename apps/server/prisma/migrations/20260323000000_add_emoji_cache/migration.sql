-- CreateTable
CREATE TABLE "emoji_cache" (
    "msg_id" TEXT NOT NULL PRIMARY KEY,
    "aes_key" TEXT NOT NULL,
    "cdn_url" TEXT NOT NULL,
    "encrypt_url" TEXT,
    "md5" TEXT,
    "file_size" INTEGER,
    "product_id" TEXT,
    "oss_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloaded_at" DATETIME
);

-- CreateIndex
CREATE INDEX "emoji_cache_status_idx" ON "emoji_cache"("status");
