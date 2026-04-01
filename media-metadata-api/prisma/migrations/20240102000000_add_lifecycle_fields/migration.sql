-- AlterTable: add lifecycle, identity, and traceability columns (idempotent)
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "status"      TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "staleReason" TEXT;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "staleAt"     TIMESTAMP(3);
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "staleBy"     TEXT;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "expiresAt"   TIMESTAMP(3);
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "contentType" TEXT;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "stationId"   TEXT;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "generatedBy" TEXT;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "runId"       TEXT;

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "media_status_idx"                       ON "media"("status");
CREATE INDEX IF NOT EXISTS "media_contentType_idx"                  ON "media"("contentType");
CREATE INDEX IF NOT EXISTS "media_stationId_idx"                    ON "media"("stationId");
CREATE INDEX IF NOT EXISTS "media_expiresAt_idx"                    ON "media"("expiresAt");
CREATE INDEX IF NOT EXISTS "media_contentType_stationId_status_idx" ON "media"("contentType", "stationId", "status");
