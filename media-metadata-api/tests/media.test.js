// tests/media.test.js
'use strict';

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createApp } = require('../src/app');
const { cleanDatabase, disconnect } = require('./helpers/testDb');
const { createMediaRecord } = require('./helpers/fixtures');

// Point uploads to a temp dir during tests so we don't pollute the real one
const testUploadDir = path.join(os.tmpdir(), 'media-api-tests');
fs.mkdirSync(testUploadDir, { recursive: true });
process.env.UPLOAD_DIR = testUploadDir;

const app = createApp();

// Create a tiny test file we can upload
const testFilePath = path.join(testUploadDir, 'test-upload.mp3');
if (!fs.existsSync(testFilePath)) {
  fs.writeFileSync(testFilePath, Buffer.alloc(1024, 0)); // 1 KB of zeros
}

beforeEach(() => cleanDatabase());
afterAll(async () => {
  await cleanDatabase();
  await disconnect();
  // Clean up test files
  try {
    fs.readdirSync(testUploadDir).forEach((f) =>
      fs.unlinkSync(path.join(testUploadDir, f))
    );
  } catch { /* ignore */ }
});

// ── Upload ────────────────────────────────────────────────────────────────────
describe('POST /api/media', () => {
  it('uploads a file and returns 201 with the media record', async () => {
    const res = await request(app)
      .post('/api/media')
      .field('title', 'My Test File')
      .field('description', 'A test upload')
      .field('metadata', JSON.stringify({ station: 'WTEST', episode: 1 }))
      .attach('file', testFilePath);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('My Test File');
    expect(res.body.mediaType).toBe('AUDIO');
    expect(res.body.metadata.station).toBe('WTEST');
    expect(res.body.checksum).toMatch(/^md5:/);
  });

  it('stores contentType, stationId, generatedBy, runId when supplied', async () => {
    const res = await request(app)
      .post('/api/media')
      .field('title', 'Station Break 001')
      .field('contentType', 'station_break')
      .field('stationId', 'station-abc')
      .field('generatedBy', 'station-break-agent')
      .field('runId', 'run-uuid-001')
      .attach('file', testFilePath);

    expect(res.status).toBe(201);
    expect(res.body.contentType).toBe('station_break');
    expect(res.body.stationId).toBe('station-abc');
    expect(res.body.generatedBy).toBe('station-break-agent');
    expect(res.body.runId).toBe('run-uuid-001');
    expect(res.body.status).toBe('active');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/media')
      .attach('file', testFilePath);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/media')
      .send({ title: 'No file' });

    expect(res.status).toBe(400);
  });
});

// ── List ──────────────────────────────────────────────────────────────────────
describe('GET /api/media', () => {
  it('returns a paginated list', async () => {
    await createMediaRecord({ title: 'Alpha' });
    await createMediaRecord({ title: 'Beta' });

    const res = await request(app).get('/api/media');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.page).toBe(1);
  });

  it('filters by mediaType', async () => {
    await createMediaRecord({ mediaType: 'AUDIO' });
    await createMediaRecord({ mediaType: 'IMAGE', mimeType: 'image/jpeg' });

    const res = await request(app).get('/api/media?mediaType=AUDIO');
    expect(res.status).toBe(200);
    expect(res.body.data.every((m) => m.mediaType === 'AUDIO')).toBe(true);
  });

  it('searches by title', async () => {
    await createMediaRecord({ title: 'Unique Podcast Title' });
    await createMediaRecord({ title: 'Something Else' });

    const res = await request(app).get('/api/media?search=Unique+Podcast');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Unique Podcast Title');
  });

  it('filters by metadata field', async () => {
    await createMediaRecord({ metadata: { station: 'WXYZ' } });
    await createMediaRecord({ metadata: { station: 'WABC' } });

    const res = await request(app).get('/api/media?metadata.station=WXYZ');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].metadata.station).toBe('WXYZ');
  });

  it('respects pagination params', async () => {
    for (let i = 0; i < 5; i++) {
      await createMediaRecord({ title: `Record ${i}` });
    }

    const res = await request(app).get('/api/media?page=2&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.totalPages).toBe(3);
  });

  it('returns 400 for invalid query params', async () => {
    const res = await request(app).get('/api/media?pageSize=999');
    expect(res.status).toBe(400);
  });

  it('filters by status', async () => {
    await createMediaRecord({ title: 'Active One', status: 'active' });
    await createMediaRecord({ title: 'Stale One', status: 'stale' });

    const res = await request(app).get('/api/media?status=stale');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('stale');
  });

  it('filters by contentType', async () => {
    await createMediaRecord({ contentType: 'station_break' });
    await createMediaRecord({ contentType: 'news_segment' });

    const res = await request(app).get('/api/media?contentType=station_break');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].contentType).toBe('station_break');
  });

  it('filters by stationId', async () => {
    await createMediaRecord({ stationId: 'station-A' });
    await createMediaRecord({ stationId: 'station-B' });

    const res = await request(app).get('/api/media?stationId=station-A');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].stationId).toBe('station-A');
  });

  it('filters by createdAfter and createdBefore', async () => {
    await createMediaRecord({ title: 'Old Record' });
    const before = new Date().toISOString();
    // Small delay so the next record is definitively after `before`
    await new Promise((r) => setTimeout(r, 10));
    await createMediaRecord({ title: 'New Record' });

    const res = await request(app).get(`/api/media?createdAfter=${before}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('New Record');
  });
});

// ── Count ─────────────────────────────────────────────────────────────────────
describe('GET /api/media/count', () => {
  it('returns the total count of all records', async () => {
    await createMediaRecord();
    await createMediaRecord();
    await createMediaRecord();

    const res = await request(app).get('/api/media/count');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });

  it('returns count filtered by status', async () => {
    await createMediaRecord({ status: 'active' });
    await createMediaRecord({ status: 'active' });
    await createMediaRecord({ status: 'stale' });

    const res = await request(app).get('/api/media/count?status=active');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it('returns count filtered by contentType and stationId', async () => {
    await createMediaRecord({ contentType: 'station_break', stationId: 'stn-1' });
    await createMediaRecord({ contentType: 'station_break', stationId: 'stn-2' });
    await createMediaRecord({ contentType: 'news_segment', stationId: 'stn-1' });

    const res = await request(app).get('/api/media/count?contentType=station_break&stationId=stn-1');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('returns 0 when nothing matches', async () => {
    await createMediaRecord({ status: 'active' });

    const res = await request(app).get('/api/media/count?status=archived');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('returns 400 for invalid query params', async () => {
    const res = await request(app).get('/api/media/count?pageSize=999');
    expect(res.status).toBe(400);
  });
});

// ── Get by ID ─────────────────────────────────────────────────────────────────
describe('GET /api/media/:id', () => {
  it('returns the media record', async () => {
    const record = await createMediaRecord({ title: 'Find Me' });

    const res = await request(app).get(`/api/media/${record.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(record.id);
    expect(res.body.title).toBe('Find Me');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/media/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

// ── Stream file ───────────────────────────────────────────────────────────────
describe('GET /api/media/:id/file', () => {
  it('returns 404 when file is missing on disk', async () => {
    const record = await createMediaRecord({ storedFilename: 'nonexistent-file.mp3' });
    const res = await request(app).get(`/api/media/${record.id}/file`);
    expect(res.status).toBe(404);
  });
});

// ── Update ────────────────────────────────────────────────────────────────────
describe('PATCH /api/media/:id', () => {
  it('updates allowed fields', async () => {
    const record = await createMediaRecord({ title: 'Old Title' });

    const res = await request(app)
      .patch(`/api/media/${record.id}`)
      .send({ title: 'New Title', tags: ['updated'] });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Title');
    expect(res.body.tags).toContain('updated');
  });

  it('deep-merges metadata', async () => {
    const record = await createMediaRecord({ metadata: { station: 'WOLD', episode: 1 } });

    const res = await request(app)
      .patch(`/api/media/${record.id}`)
      .send({ metadata: { episode: 2, approved: true } });

    expect(res.status).toBe(200);
    expect(res.body.metadata.station).toBe('WOLD');   // preserved
    expect(res.body.metadata.episode).toBe(2);        // updated
    expect(res.body.metadata.approved).toBe(true);    // added
  });

  it('updates contentType, stationId, generatedBy, runId', async () => {
    const record = await createMediaRecord();

    const res = await request(app)
      .patch(`/api/media/${record.id}`)
      .send({ contentType: 'music_track', stationId: 'stn-99', generatedBy: 'music-service', runId: 'run-xyz' });

    expect(res.status).toBe(200);
    expect(res.body.contentType).toBe('music_track');
    expect(res.body.stationId).toBe('stn-99');
    expect(res.body.generatedBy).toBe('music-service');
    expect(res.body.runId).toBe('run-xyz');
  });

  it('returns 400 when body is empty', async () => {
    const record = await createMediaRecord();
    const res = await request(app).patch(`/api/media/${record.id}`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch('/api/media/00000000-0000-0000-0000-000000000000')
      .send({ title: 'X' });
    expect(res.status).toBe(404);
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────
describe('DELETE /api/media/:id', () => {
  it('deletes the record and returns confirmation', async () => {
    const record = await createMediaRecord();

    const res = await request(app).delete(`/api/media/${record.id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.id).toBe(record.id);

    // Confirm it is gone
    const check = await request(app).get(`/api/media/${record.id}`);
    expect(check.status).toBe(404);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/media/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

// ── Status transitions ────────────────────────────────────────────────────────
describe('POST /api/media/:id/mark-stale', () => {
  it('sets status=stale and records staleReason, staleBy, staleAt', async () => {
    const record = await createMediaRecord();

    const res = await request(app)
      .post(`/api/media/${record.id}/mark-stale`)
      .send({ reason: 'ttl_expired', staleBy: 'librarian-agent' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('stale');
    expect(res.body.staleReason).toBe('ttl_expired');
    expect(res.body.staleBy).toBe('librarian-agent');
    expect(res.body.staleAt).toBeDefined();
  });

  it('returns 400 when reason is invalid', async () => {
    const record = await createMediaRecord();

    const res = await request(app)
      .post(`/api/media/${record.id}/mark-stale`)
      .send({ reason: 'not_a_real_reason', staleBy: 'librarian-agent' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when required fields are missing', async () => {
    const record = await createMediaRecord();

    const res = await request(app)
      .post(`/api/media/${record.id}/mark-stale`)
      .send({ reason: 'manual' }); // missing staleBy

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/media/00000000-0000-0000-0000-000000000000/mark-stale')
      .send({ reason: 'manual', staleBy: 'librarian-agent' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/media/:id/mark-pending', () => {
  it('sets status=pending and records generatedBy, runId', async () => {
    const record = await createMediaRecord();

    const res = await request(app)
      .post(`/api/media/${record.id}/mark-pending`)
      .send({ claimedBy: 'music-service', runId: 'run-abc-123' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.generatedBy).toBe('music-service');
    expect(res.body.runId).toBe('run-abc-123');
  });

  it('returns 400 when required fields are missing', async () => {
    const record = await createMediaRecord();

    const res = await request(app)
      .post(`/api/media/${record.id}/mark-pending`)
      .send({ claimedBy: 'music-service' }); // missing runId

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/media/00000000-0000-0000-0000-000000000000/mark-pending')
      .send({ claimedBy: 'music-service', runId: 'run-xyz' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/media/:id/archive', () => {
  it('sets status=archived', async () => {
    const record = await createMediaRecord();

    const res = await request(app)
      .post(`/api/media/${record.id}/archive`)
      .send({ archivedBy: 'librarian-agent' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('archived');
  });

  it('returns 400 when archivedBy is missing', async () => {
    const record = await createMediaRecord();

    const res = await request(app)
      .post(`/api/media/${record.id}/archive`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/media/00000000-0000-0000-0000-000000000000/archive')
      .send({ archivedBy: 'librarian-agent' });

    expect(res.status).toBe(404);
  });
});

// ── v2 envelope ───────────────────────────────────────────────────────────────
describe('GET /api/v2/media', () => {
  it('returns envelope with hasMore=false when all records fit on one page', async () => {
    await createMediaRecord({ title: 'Alpha' });
    await createMediaRecord({ title: 'Beta' });

    const res = await request(app).get('/api/v2/media');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.hasMore).toBe(false);
    expect(res.body.pagination.totalPages).toBeUndefined();
  });

  it('returns hasMore=true when more records exist beyond the page', async () => {
    for (let i = 0; i < 5; i++) {
      await createMediaRecord({ title: `Track ${i}` });
    }

    const res = await request(app).get('/api/v2/media?page=1&pageSize=3');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.hasMore).toBe(true);
    expect(res.body.pagination.total).toBe(5);
  });

  it('supports status filter', async () => {
    await createMediaRecord({ status: 'active', contentType: 'station_break' });
    await createMediaRecord({ status: 'stale', contentType: 'station_break' });

    const res = await request(app).get('/api/v2/media?status=active&contentType=station_break');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('active');
  });
});

describe('GET /api/v2/media/count', () => {
  it('returns { count: N } without extra envelope wrapping', async () => {
    await createMediaRecord({ status: 'active' });
    await createMediaRecord({ status: 'active' });
    await createMediaRecord({ status: 'stale' });

    const res = await request(app).get('/api/v2/media/count?status=active');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    // count endpoint should NOT be double-wrapped
    expect(res.body.data).toBeUndefined();
  });
});

describe('GET /api/v2/media/:id', () => {
  it('returns single record wrapped in envelope', async () => {
    const record = await createMediaRecord({ title: 'Wrapped Record' });

    const res = await request(app).get(`/api/v2/media/${record.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(record.id);
    expect(res.body.data.title).toBe('Wrapped Record');
    expect(res.body.pagination).toEqual({ total: 1, page: 1, pageSize: 1, hasMore: false });
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/v2/media/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v2/media/:id/mark-stale', () => {
  it('returns stale record wrapped in envelope', async () => {
    const record = await createMediaRecord();

    const res = await request(app)
      .post(`/api/v2/media/${record.id}/mark-stale`)
      .send({ reason: 'superseded', staleBy: 'librarian-agent' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('stale');
    expect(res.body.data.staleReason).toBe('superseded');
    expect(res.body.pagination).toEqual({ total: 1, page: 1, pageSize: 1, hasMore: false });
  });
});

// ── Swagger / OpenAPI ─────────────────────────────────────────────────────────
describe('GET /openapi.json', () => {
  it('returns a valid OpenAPI spec', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBeDefined();
  });
});
