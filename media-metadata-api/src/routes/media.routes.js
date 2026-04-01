// src/routes/media.routes.js
'use strict';

const express = require('express');
const router = express.Router();

const controller = require('../controllers/media.controller');
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

/**
 * @openapi
 * /api/media:
 *   post:
 *     tags: [Media]
 *     summary: Upload a new media file
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: string
 *                 description: JSON array string or comma-separated list
 *               durationSeconds:
 *                 type: number
 *               width:
 *                 type: integer
 *               height:
 *                 type: integer
 *               createdBy:
 *                 type: string
 *               metadata:
 *                 type: string
 *                 description: JSON object string with arbitrary key-value pairs
 *               contentType:
 *                 type: string
 *                 description: "Starcast content type (e.g. station_break, news_segment, music_track)"
 *               stationId:
 *                 type: string
 *               generatedBy:
 *                 type: string
 *                 description: Agent name that generated this content
 *               runId:
 *                 type: string
 *                 description: UUID of the agent run that created this
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
 *               $ref: '#/components/schemas/Media'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       413:
 *         description: File too large
 */
router.post(
  '/',
  upload.single('file'),
  (req, res, next) => {
    logger.debug('POST /api/media - parsed body', {
      body: req.body,
      file: req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : null,
    });
    // Ensure title is always present for the validator —
    // the controller will override with ID3 title after validation
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
 * /api/media/count:
 *   get:
 *     tags: [Media]
 *     summary: Count media records matching the given filters
 *     description: >
 *       Accepts the same filter parameters as GET /api/media (excluding
 *       pagination and sort). Returns a single count — agents use this to
 *       check depth without fetching full records.
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
 *                 count: { type: integer, example: 42 }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
// NOTE: /count must be registered before /:id so Express doesn't treat "count" as an id
router.get('/count', validate(listQuerySchema, 'query'), controller.count);

/**
 * @openapi
 * /api/media:
 *   get:
 *     tags: [Media]
 *     summary: List and search media records
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
 *         description: Full-text search on title, description, originalFilename
 *       - in: query
 *         name: mediaType
 *         schema: { type: string, enum: [AUDIO, IMAGE, VIDEO, OTHER] }
 *       - in: query
 *         name: tags
 *         schema: { type: string }
 *         description: Comma-separated tag list (matches any)
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
 *         description: "e.g. station_break, news_segment, music_track"
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
 *       - in: query
 *         name: "metadata.station"
 *         schema: { type: string }
 *         description: Filter by arbitrary metadata field (e.g. metadata.station=WKRP)
 *     responses:
 *       200:
 *         description: Paginated list of media
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MediaList'
 */
router.get('/', validate(listQuerySchema, 'query'), controller.list);

/**
 * @openapi
 * /api/media/{id}:
 *   get:
 *     tags: [Media]
 *     summary: Get a single media record by ID
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
 *               $ref: '#/components/schemas/Media'
 *       404:
 *         description: Not found
 */
router.get('/:id', controller.getById);

/**
 * @openapi
 * /api/media/{id}/file:
 *   get:
 *     tags: [Media]
 *     summary: Stream / download the raw media file
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: header
 *         name: Range
 *         schema: { type: string }
 *         description: "HTTP range request (e.g. bytes=0-1023)"
 *     responses:
 *       200:
 *         description: Full file stream
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       206:
 *         description: Partial content (range response)
 *       404:
 *         description: Not found
 */
router.get('/:id/file', controller.streamFile);

/**
 * @openapi
 * /api/media/{id}:
 *   patch:
 *     tags: [Media]
 *     summary: Update media metadata
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
 *               durationSeconds: { type: number }
 *               width: { type: integer }
 *               height: { type: integer }
 *               createdBy: { type: string }
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Merged (not replaced) into existing metadata
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
 *     responses:
 *       200:
 *         description: Updated media record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Media'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 */
router.patch('/:id', validate(updateBodySchema, 'body'), controller.update);

/**
 * @openapi
 * /api/media/{id}:
 *   delete:
 *     tags: [Media]
 *     summary: Delete a media record and its file on disk
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Deletion confirmation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted: { type: boolean }
 *                 id: { type: string, format: uuid }
 *       404:
 *         description: Not found
 */
router.delete('/:id', controller.remove);

/**
 * @openapi
 * /api/media/{id}/mark-stale:
 *   post:
 *     tags: [Media]
 *     summary: Mark a media record as stale
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
 *               staleBy:
 *                 type: string
 *                 description: Agent or user that triggered the staleness
 *     responses:
 *       200:
 *         description: Updated media record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Media'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         description: Not found
 */
router.post('/:id/mark-stale', validate(markStaleBodySchema, 'body'), controller.markStale);

/**
 * @openapi
 * /api/media/{id}/mark-pending:
 *   post:
 *     tags: [Media]
 *     summary: Mark a media record as pending (claimed by an agent run)
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
 *               claimedBy:
 *                 type: string
 *                 description: Agent name claiming this record
 *               runId:
 *                 type: string
 *                 description: UUID of the agent run
 *     responses:
 *       200:
 *         description: Updated media record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Media'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         description: Not found
 */
router.post('/:id/mark-pending', validate(markPendingBodySchema, 'body'), controller.markPending);

/**
 * @openapi
 * /api/media/{id}/archive:
 *   post:
 *     tags: [Media]
 *     summary: Archive a media record
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
 *               archivedBy:
 *                 type: string
 *                 description: Agent or user performing the archive
 *     responses:
 *       200:
 *         description: Updated media record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Media'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         description: Not found
 */
router.post('/:id/archive', validate(archiveBodySchema, 'body'), controller.archive);

module.exports = router;
