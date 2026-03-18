// src/controllers/media.controller.js
'use strict';

const service = require('../services/media.service');
const { ValidationError } = require('../utils/errors');
const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../config/logger');

// ── ID3 extraction ────────────────────────────────────────────────────────────
// Requires: npm install music-metadata
async function extractId3(filePath, mimeType) {
  if (!mimeType.startsWith('audio/')) return null;
  try {
    const mm = require('music-metadata');
    const meta = await mm.parseFile(filePath, { skipCovers: false });
    const { common, format } = meta;

    // Cover art — first embedded picture
    let coverBuffer = null;
    let coverMime   = null;
    if (common.picture && common.picture.length > 0) {
      coverBuffer = common.picture[0].data;
      coverMime   = common.picture[0].format || 'image/jpeg';
    }

    return {
      title:          common.title   || null,
      artist:         common.artist  || null,
      album:          common.album   || null,
      lyrics:         common.lyrics  ? common.lyrics.join('\n') : null,
      durationSeconds:format.duration ? Math.round(format.duration) : null,
      coverBuffer,
      coverMime,
    };
  } catch (err) {
    logger.warn('ID3 extraction failed', { path: filePath, error: err.message });
    return null;
  }
}

// ── Save embedded cover art to disk & create a media record ──────────────────
async function createCoverRecord(coverBuffer, coverMime, trackTitle) {
  try {
    const ext      = coverMime.includes('png') ? '.png' : '.jpg';
    const filename = `${uuidv4()}${ext}`;
    const destPath = path.join(config.storage.uploadDir, filename);

    fs.writeFileSync(destPath, coverBuffer);

    const fakeFile = {
      path:             destPath,
      filename,
      originalname:     `${trackTitle || 'cover'}${ext}`,
      mimetype:         coverMime,
      size:             coverBuffer.length,
    };

    const coverBody = { title: `${trackTitle || 'Cover'} — Art` };
    const record    = await service.createMedia(fakeFile, coverBody);
    logger.info(`Created cover art record ${record.id} from embedded ID3`);
    return record.id;
  } catch (err) {
    logger.warn('Failed to create cover art record from ID3', { error: err.message });
    return null;
  }
}

// ── POST /api/media ───────────────────────────────────────────────────────────
async function upload(req, res) {
  if (!req.file) {
    throw new ValidationError('A file must be attached under the field name "file"');
  }

  // Extract ID3 tags for audio files
  const id3 = await extractId3(req.file.path, req.file.mimetype);
  logger.info('ID3 extraction result', {
    file: req.file.originalname,
    hasLyrics: !!id3?.lyrics,
    hasCover:  !!id3?.coverBuffer,
    title:     id3?.title,
    artist:    id3?.artist,
  });

  // Parse whatever metadata the user already sent
  let userMeta = {};
  if (req.body.metadata) {
    try {
      userMeta = typeof req.body.metadata === 'object'
        ? req.body.metadata
        : JSON.parse(req.body.metadata);
    } catch { userMeta = {}; }
  }

  // Merge ID3 → body, with user-supplied values always winning
  if (id3) {
    // Title: ID3 wins over filename fallback; only a user-typed title overrides ID3.
    // The route middleware sets a filename fallback so the validator passes,
    // but we always replace that with the real ID3 title when available.
    if (id3.title) {
      req.body.title = id3.title;
    }

    // Duration from format metadata
    if (!req.body.durationSeconds && id3.durationSeconds) {
      req.body.durationSeconds = id3.durationSeconds;
    }

    // Merge into metadata object — user values win
    // Build metadata: ID3 as base, user-supplied values override
    const id3Meta = {};
    if (id3.artist) id3Meta.artist = id3.artist;
    if (id3.album)  id3Meta.album  = id3.album;
    if (id3.lyrics) id3Meta.lyrics = id3.lyrics;

    // userMeta spread last so manual entries always win over ID3
    req.body.metadata = JSON.stringify({ ...id3Meta, ...userMeta });
  }

  // Ensure title always has a fallback
  if (!req.body.title) {
    req.body.title = path.parse(req.file.originalname).name;
  }

  // Create the main media record
  const media = await service.createMedia(req.file, req.body);

  // If ID3 had embedded cover art and user didn't supply art_id, create a cover record
  if (id3?.coverBuffer && !userMeta.art_id) {
    const artId = await createCoverRecord(id3.coverBuffer, id3.coverMime, media.title);
    if (artId) {
      // Patch art_id onto the just-created track
      await service.updateMedia(media.id, { metadata: { art_id: artId } });
      media.metadata = { ...(media.metadata || {}), art_id: artId };
    }
  }

  return res.status(201).json(media);
}

// ── GET /api/media ────────────────────────────────────────────────────────────
async function list(req, res) {
  const result = await service.listMedia(req.query);
  return res.json(result);
}

// ── GET /api/media/:id ────────────────────────────────────────────────────────
async function getById(req, res) {
  const media = await service.getMediaById(req.params.id);
  return res.json(media);
}

// ── GET /api/media/:id/file ───────────────────────────────────────────────────
async function streamFile(req, res) {
  const { absolutePath, record } = await service.getMediaFilePath(req.params.id);

  const stat      = fs.statSync(absolutePath);
  const fileSize  = stat.size;
  const rangeHeader = req.headers.range;

  res.setHeader('Content-Type', record.mimeType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(record.originalFilename)}"`
  );

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
    const start    = parseInt(startStr, 10);
    const end      = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunkSize);

    return fs.createReadStream(absolutePath, { start, end }).pipe(res);
  }

  res.setHeader('Content-Length', fileSize);
  res.setHeader('Accept-Ranges', 'bytes');
  return fs.createReadStream(absolutePath).pipe(res);
}

// ── PATCH /api/media/:id ──────────────────────────────────────────────────────
async function update(req, res) {
  const media = await service.updateMedia(req.params.id, req.body);
  return res.json(media);
}

// ── DELETE /api/media/:id ─────────────────────────────────────────────────────
async function remove(req, res) {
  const result = await service.deleteMedia(req.params.id);
  return res.json(result);
}

module.exports = { upload, list, getById, streamFile, update, remove };
