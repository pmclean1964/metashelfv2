-- AlterTable: add lifecycle, identity, and traceability columns
ALTER TABLE "media"
  ADD COLUMN "status"      TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "staleReason" TEXT,
  ADD COLUMN "staleAt"     TIMESTAMP(3),
  ADD COLUMN "staleBy"     TEXT,
  ADD COLUMN "expiresAt"   TIMESTAMP(3),
  ADD COLUMN "contentType" TEXT,
  ADD COLUMN "stationId"   TEXT,
  ADD COLUMN "generatedBy" TEXT,
  ADD COLUMN "runId"       TEXT;

-- CreateIndex
CREATE INDEX "media_status_idx"                      ON "media"("status");
CREATE INDEX "media_contentType_idx"                 ON "media"("contentType");
CREATE INDEX "media_stationId_idx"                   ON "media"("stationId");
CREATE INDEX "media_expiresAt_idx"                   ON "media"("expiresAt");
CREATE INDEX "media_contentType_stationId_status_idx" ON "media"("contentType", "stationId", "status");
