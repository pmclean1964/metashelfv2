// src/routes/media.v2.routes.js
// v2 prefix: /api/v2/media
// All responses are wrapped in the standard envelope:
//   { data: <payload>, pagination: { total, page, pageSize, hasMore } }
// Except: GET /count returns { count: N } and GET /:id/file streams binary.
'use strict';

const express = require('express');
const router = express.Router();

const controller = require('../controllers/media.controller');
const { wrapEnvelope } = require('../controllers/media.v2.controller');
const { upload } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const logger = require('../config/logger');
const {
  uploadBodySchema,
  updateBodySchema,
  listQuerySchema,
  markStaleBodySchema,
  markPendingBodySchema,
  archiveBodySchema,
} = require('../validators/media.validators');

// Apply envelope wrapper to all routes in this router
router.use(wrapEnvelope);

/**
 * @openapi
 * /api/v2/media:
 *   post:
 *     tags: [Media v2]
 *     summary: Upload a new media file (v2 — envelope response)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, title]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               title: { type: string }
 *               description: { type: string }
 *               tags: { type: string }
 *               durationSeconds: { type: number }
 *               width: { type: integer }
 *               height: { type: integer }
 *               createdBy: { type: string }
 *               metadata: { type: string }
 *               contentType: { type: string }
 *               stationId: { type: string }
 *               generatedBy: { type: string }
 *               runId: { type: string }
 *               status:
 *                 type: string
 *                 enum: [active, stale, pending, error, archived]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Media created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaV2Single'
 */
router.post(
  '/',
  upload.single('file'),
  (req, res, next) => {
    logger.debug('POST /api/v2/media - parsed body', {
      body: req.body,
      file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : null,
    });
    if (!req.body.title && req.file) {
      const path = require('path');
      req.body.title = path.parse(req.file.originalname).name;
    }
    next();
  },
  validate(uploadBodySchema, 'body'),
  controller.upload
);

/**
 * @openapi
 * /api/v2/media/count:
 *   get:
 *     tags: [Media v2]
 *     summary: Count media records matching the given filters (v2)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, stale, pending, error, archived] }
 *       - in: query
 *         name: contentType
 *         schema: { type: string }
 *       - in: query
 *         name: stationId
 *         schema: { type: string }
 *       - in: query
 *         name: mediaType
 *         schema: { type: string, enum: [AUDIO, IMAGE, VIDEO, OTHER] }
 *       - in: query
 *         name: createdAfter
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: createdBefore
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: expiresAfter
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: expiresBefore
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Count of matching records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 */
router.get('/count', validate(listQuerySchema, 'query'), controller.count);

/**
 * @openapi
 * /api/v2/media:
 *   get:
 *     tags: [Media v2]
 *     summary: List and search media records (v2 — envelope response with hasMore)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: mediaType
 *         schema: { type: string, enum: [AUDIO, IMAGE, VIDEO, OTHER] }
 *       - in: query
 *         name: tags
 *         schema: { type: string }
 *       - in: query
 *         name: mimeType
 *         schema: { type: string }
 *       - in: query
 *         name: createdBy
 *         schema: { type: string }
 *       - in: query
 *         name: checksum
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, updatedAt, title, sizeBytes], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, stale, pending, error, archived] }
 *       - in: query
 *         name: contentType
 *         schema: { type: string }
 *       - in: query
 *         name: stationId
 *         schema: { type: string }
 *       - in: query
 *         name: createdAfter
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: createdBefore
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: expiresAfter
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: expiresBefore
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Paginated list of media
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaV2List'
 */
router.get('/', validate(listQuerySchema, 'query'), controller.list);

/**
 * @openapi
 * /api/v2/media/{id}:
 *   get:
 *     tags: [Media v2]
 *     summary: Get a single media record by ID (v2 — envelope response)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Media record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaV2Single'
 *       404:
 *         description: Not found
 */
router.get('/:id', controller.getById);

/**
 * @openapi
 * /api/v2/media/{id}/file:
 *   get:
 *     tags: [Media v2]
 *     summary: Stream / download the raw media file (v2)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: header
 *         name: Range
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full file stream
 *       206:
 *         description: Partial content
 *       404:
 *         description: Not found
 */
router.get('/:id/file', controller.streamFile);

/**
 * @openapi
 * /api/v2/media/{id}:
 *   patch:
 *     tags: [Media v2]
 *     summary: Update media metadata (v2 — envelope response)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *               contentType: { type: string }
 *               stationId: { type: string }
 *               generatedBy: { type: string }
 *               runId: { type: string }
 *               status:
 *                 type: string
 *                 enum: [active, stale, pending, error, archived]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *     responses:
 *       200:
 *         description: Updated media record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaV2Single'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 */
router.patch('/:id', validate(updateBodySchema, 'body'), controller.update);

/**
 * @openapi
 * /api/v2/media/{id}:
 *   delete:
 *     tags: [Media v2]
 *     summary: Delete a media record (v2 — envelope response)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Deletion confirmation
 *       404:
 *         description: Not found
 */
router.delete('/:id', controller.remove);

/**
 * @openapi
 * /api/v2/media/{id}/mark-stale:
 *   post:
 *     tags: [Media v2]
 *     summary: Mark a media record as stale (v2)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason, staleBy]
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [ttl_expired, depth_cull, superseded, integrity_check, manual]
 *               staleBy: { type: string }
 *     responses:
 *       200:
 *         description: Updated media record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaV2Single'
 *       404:
 *         description: Not found
 */
router.post('/:id/mark-stale', validate(markStaleBodySchema, 'body'), controller.markStale);

/**
 * @openapi
 * /api/v2/media/{id}/mark-pending:
 *   post:
 *     tags: [Media v2]
 *     summary: Mark a media record as pending (v2)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [claimedBy, runId]
 *             properties:
 *               claimedBy: { type: string }
 *               runId: { type: string }
 *     responses:
 *       200:
 *         description: Updated media record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaV2Single'
 *       404:
 *         description: Not found
 */
router.post('/:id/mark-pending', validate(markPendingBodySchema, 'body'), controller.markPending);

/**
 * @openapi
 * /api/v2/media/{id}/archive:
 *   post:
 *     tags: [Media v2]
 *     summary: Archive a media record (v2)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [archivedBy]
 *             properties:
 *               archivedBy: { type: string }
 *     responses:
 *       200:
 *         description: Updated media record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaV2Single'
 *       404:
 *         description: Not found
 */
router.post('/:id/archive', validate(archiveBodySchema, 'body'), controller.archive);

module.exports = router;
