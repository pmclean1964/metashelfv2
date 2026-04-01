// src/repositories/media.repository.js
'use strict';

const prisma = require('../config/prisma');

/**
 * Parse query params of the form metadata.key=value into a Prisma
 * `path` filter clause for JSONB.
 *
 * @param {Record<string,string>} query  raw req.query
 * @returns {Array<object>}              array of Prisma `AND` conditions
 */
function buildMetadataFilters(query) {
  const conditions = [];
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('metadata.')) continue;
    const jsonKey = key.slice('metadata.'.length); // e.g. "family"

    // Cast to number when possible so numeric comparisons work
    const parsed = Number(value);
    const isNumeric = !isNaN(parsed) && value !== '';

    if (isNumeric) {
      // Numeric: use exact equals
      conditions.push({
        metadata: {
          path: [jsonKey],
          equals: parsed,
        },
      });
    } else {
      // String: use string_contains so that minor casing or encoding
      // differences (e.g. "Space_Weather" vs "space_weather") don't
      // cause a miss. Family values are unique enough that a substring
      // match is safe.
      conditions.push({
        metadata: {
          path: [jsonKey],
          string_contains: value,
        },
      });
    }
  }
  return conditions;
}

/**
 * Build a Prisma `where` clause from list/search query parameters.
 */
function buildWhereClause(query) {
  const {
    search,
    mediaType,
    tags,
    createdBy,
    mimeType,
    checksum,
    // New filters
    status,
    contentType,
    stationId,
    createdAfter,
    createdBefore,
    expiresAfter,
    expiresBefore,
    ...rest
  } = query;

  const and = [];

  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { originalFilename: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  if (mediaType) and.push({ mediaType });
  if (createdBy) and.push({ createdBy });
  if (mimeType) and.push({ mimeType: { contains: mimeType, mode: 'insensitive' } });
  if (checksum) and.push({ checksum });

  if (tags) {
    const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagArray.length) {
      and.push({ tags: { hasSome: tagArray } });
    }
  }

  // New field filters — exact match
  if (status) and.push({ status });
  if (contentType) and.push({ contentType });
  if (stationId) and.push({ stationId });

  // Date range filters
  if (createdAfter || createdBefore) {
    const filter = {};
    if (createdAfter) filter.gte = new Date(createdAfter);
    if (createdBefore) filter.lte = new Date(createdBefore);
    and.push({ createdAt: filter });
  }

  if (expiresAfter || expiresBefore) {
    const filter = {};
    if (expiresAfter) filter.gte = new Date(expiresAfter);
    if (expiresBefore) filter.lte = new Date(expiresBefore);
    and.push({ expiresAt: filter });
  }

  const metaConditions = buildMetadataFilters(rest);
  and.push(...metaConditions);

  return and.length ? { AND: and } : {};
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

async function create(data) {
  return prisma.media.create({ data });
}

async function findMany({ where, orderBy, skip, take }) {
  const [records, total] = await prisma.$transaction([
    prisma.media.findMany({ where, orderBy, skip, take }),
    prisma.media.count({ where }),
  ]);
  return { records, total };
}

async function count(where) {
  return prisma.media.count({ where });
}

async function findById(id) {
  return prisma.media.findUnique({ where: { id } });
}

async function findByStoredFilename(storedFilename) {
  return prisma.media.findUnique({ where: { storedFilename } });
}

async function update(id, data) {
  return prisma.media.update({ where: { id }, data });
}

async function remove(id) {
  return prisma.media.delete({ where: { id } });
}

module.exports = {
  buildWhereClause,
  create,
  findMany,
  count,
  findById,
  findByStoredFilename,
  update,
  remove,
};
