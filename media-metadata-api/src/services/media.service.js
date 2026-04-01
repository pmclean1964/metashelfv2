// src/services/media.service.js
'use strict';

const fs = require('fs');
const path = require('path');
const repo = require('../repositories/media.repository');
const { computeChecksum } = require('../utils/checksum');
const { deriveMediaType } = require('../utils/mediaType');
const { serialiseMedia, serialiseMediaList } = require('../utils/serialise');
const { NotFoundError } = require('../utils/errors');
const config = require('../config');
const logger = require('../config/logger');

// ── Create ────────────────────────────────────────────────────────────────────

async function createMedia(file, body) {
  const checksum = await computeChecksum(file.path);

  // Parse tags (form-data may send a JSON string or a comma-separated string)
  let tags = [];
  if (body.tags) {
    if (Array.isArray(body.tags)) {
      tags = body.tags;
    } else {
      try {
        const parsed = JSON.parse(body.tags);
        tags = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        tags = body.tags.split(',').map((t) => t.trim()).filter(Boolean);
      }
    }
  }

  // Parse metadata (form-data sends it as a JSON string)
  let metadata = {};
  if (body.metadata) {
    if (typeof body.metadata === 'object') {
      metadata = body.metadata;
    } else {
      try {
        metadata = JSON.parse(body.metadata);
      } catch {
        metadata = {};
      }
    }
  }

  const storagePath = path.relative(process.cwd(), file.path);

  const record = await repo.create({
    title: body.title,
    description: body.description || null,
    tags,
    mediaType: deriveMediaType(file.mimetype),
    mimeType: file.mimetype,
    originalFilename: file.originalname,
    storedFilename: file.filename,
    storagePath,
    sizeBytes: BigInt(file.size),
    checksum,
    durationSeconds: body.durationSeconds ? Number(body.durationSeconds) : null,
    width: body.width ? Number(body.width) : null,
    height: body.height ? Number(body.height) : null,
    createdBy: body.createdBy || null,
    metadata,
    // Starcast / lifecycle fields
    status: body.status || 'active',
    contentType: body.contentType || null,
    stationId: body.stationId || null,
    generatedBy: body.generatedBy || null,
    runId: body.runId || null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  });

  return serialiseMedia(record);
}

// ── List / search ─────────────────────────────────────────────────────────────

async function listMedia(query) {
  const { page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc', ...rest } = query;

  const where = repo.buildWhereClause(rest);
  const skip = (page - 1) * pageSize;
  const orderBy = { [sortBy]: sortOrder };

  const { records, total } = await repo.findMany({ where, orderBy, skip, take: pageSize });

  return {
    data: serialiseMediaList(records),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ── Count ─────────────────────────────────────────────────────────────────────

async function countMedia(query) {
  // Strip pagination/sort params — they don't affect the count
  const { page, pageSize, sortBy, sortOrder, ...rest } = query;
  const where = repo.buildWhereClause(rest);
  return repo.count(where);
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

async function getMediaById(id) {
  const record = await repo.findById(id);
  if (!record) throw new NotFoundError('Media', id);
  return serialiseMedia(record);
}

// ── Get file path for streaming ───────────────────────────────────────────────

async function getMediaFilePath(id) {
  const record = await repo.findById(id);
  if (!record) throw new NotFoundError('Media', id);

  const absolutePath = path.join(config.storage.uploadDir, record.storedFilename);
  if (!fs.existsSync(absolutePath)) {
    throw new NotFoundError('File on disk for media', id);
  }

  return { absolutePath, record: serialiseMedia(record) };
}

// ── Update ────────────────────────────────────────────────────────────────────

async function updateMedia(id, body) {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError('Media', id);

  // Deep-merge metadata: existing + patch
  const mergedMetadata =
    body.metadata != null
      ? { ...(existing.metadata || {}), ...body.metadata }
      : undefined;

  const data = {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.tags !== undefined && { tags: body.tags }),
    ...(body.durationSeconds !== undefined && { durationSeconds: body.durationSeconds }),
    ...(body.width !== undefined && { width: body.width }),
    ...(body.height !== undefined && { height: body.height }),
    ...(body.createdBy !== undefined && { createdBy: body.createdBy }),
    ...(mergedMetadata !== undefined && { metadata: mergedMetadata }),
    // Starcast / lifecycle fields
    ...(body.status !== undefined && { status: body.status }),
    ...(body.contentType !== undefined && { contentType: body.contentType || null }),
    ...(body.stationId !== undefined && { stationId: body.stationId || null }),
    ...(body.generatedBy !== undefined && { generatedBy: body.generatedBy || null }),
    ...(body.runId !== undefined && { runId: body.runId || null }),
    ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
  };

  const updated = await repo.update(id, data);
  return serialiseMedia(updated);
}

// ── Status transitions ────────────────────────────────────────────────────────

async function markStale(id, { reason, staleBy }) {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError('Media', id);

  const updated = await repo.update(id, {
    status: 'stale',
    staleReason: reason,
    staleAt: new Date(),
    staleBy,
  });
  return serialiseMedia(updated);
}

async function markPending(id, { claimedBy, runId }) {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError('Media', id);

  const updated = await repo.update(id, {
    status: 'pending',
    generatedBy: claimedBy,
    runId,
  });
  return serialiseMedia(updated);
}

async function archiveMedia(id, { archivedBy }) {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError('Media', id);

  const updated = await repo.update(id, {
    status: 'archived',
    staleBy: archivedBy,
  });
  return serialiseMedia(updated);
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function deleteMedia(id) {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError('Media', id);

  // Remove file from disk (best-effort — don't fail the delete if file is missing)
  const absolutePath = path.join(config.storage.uploadDir, existing.storedFilename);
  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      logger.info(`Deleted file from disk: ${absolutePath}`);
    }
  } catch (err) {
    logger.warn(`Could not delete file from disk: ${absolutePath}`, { error: err.message });
  }

  await repo.remove(id);
  return { deleted: true, id };
}

module.exports = {
  createMedia,
  listMedia,
  countMedia,
  getMediaById,
  getMediaFilePath,
  updateMedia,
  markStale,
  markPending,
  archiveMedia,
  deleteMedia,
};
