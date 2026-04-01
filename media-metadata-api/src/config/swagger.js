// src/config/swagger.js
'use strict';

const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./index');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Media Metadata API',
      version: '1.0.0',
      description:
        'REST API for uploading, managing, and streaming media files (audio, images, video) with extensible JSONB metadata.',
      contact: { name: 'API Support', email: 'support@example.com' },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Local development server',
      },
    ],
    components: {
      responses: {
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
      schemas: {
        Media: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
            title: { type: 'string', example: 'My Podcast Episode' },
            description: { type: 'string', nullable: true, example: 'Episode 42 of the show' },
            tags: { type: 'array', items: { type: 'string' }, example: ['podcast', 'tech'] },
            mediaType: { type: 'string', enum: ['AUDIO', 'IMAGE', 'VIDEO', 'OTHER'] },
            mimeType: { type: 'string', example: 'audio/mpeg' },
            originalFilename: { type: 'string', example: 'episode-42.mp3' },
            storedFilename: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp3' },
            storagePath: { type: 'string', example: 'uploads/a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp3' },
            sizeBytes: { type: 'integer', example: 4096000 },
            checksum: { type: 'string', example: 'md5:abc123...' },
            durationSeconds: { type: 'number', nullable: true, example: 3600.5 },
            width: { type: 'integer', nullable: true, example: 1920 },
            height: { type: 'integer', nullable: true, example: 1080 },
            createdBy: { type: 'string', nullable: true, example: 'user-uuid' },
            metadata: {
              type: 'object',
              additionalProperties: true,
              example: { station: 'WKRP', season: 3, episode: 42, approved: true },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            // Lifecycle fields
            status: { type: 'string', enum: ['active', 'stale', 'pending', 'error', 'archived'], example: 'active' },
            staleReason: { type: 'string', nullable: true, enum: ['ttl_expired', 'depth_cull', 'superseded', 'integrity_check', 'manual'] },
            staleAt: { type: 'string', format: 'date-time', nullable: true },
            staleBy: { type: 'string', nullable: true },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            contentType: { type: 'string', nullable: true, example: 'station_break' },
            stationId: { type: 'string', nullable: true, example: 'station-uuid' },
            generatedBy: { type: 'string', nullable: true, example: 'station-break-agent' },
            runId: { type: 'string', nullable: true, example: 'run-uuid' },
          },
        },
        MediaList: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/Media' } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                page: { type: 'integer' },
                pageSize: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
        MediaV2List: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/Media' } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                page: { type: 'integer' },
                pageSize: { type: 'integer' },
                hasMore: { type: 'boolean' },
              },
            },
          },
        },
        MediaV2Single: {
          type: 'object',
          properties: {
            data: { $ref: '#/components/schemas/Media' },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'integer', example: 1 },
                page: { type: 'integer', example: 1 },
                pageSize: { type: 'integer', example: 1 },
                hasMore: { type: 'boolean', example: false },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
    tags: [
      { name: 'Media', description: 'Media file upload and management (v1)' },
      { name: 'Media v2', description: 'Media API — v2 envelope (data + pagination.hasMore)' },
      { name: 'System', description: 'Health and metadata endpoints' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
