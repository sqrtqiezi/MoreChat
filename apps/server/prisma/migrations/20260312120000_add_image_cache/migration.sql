-- CreateTable
CREATE TABLE "image_cache" (
    "msg_id" TEXT NOT NULL PRIMARY KEY,
    "aes_key" TEXT NOT NULL,
    "cdn_file_id" TEXT NOT NULL,
    "download_url" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloaded_at" DATETIME
);
