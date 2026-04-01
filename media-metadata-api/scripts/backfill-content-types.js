// scripts/backfill-content-types.js
//
// Backfills contentType, stationId, generatedBy, and ensures status='active'
// on all existing Media records.
//
// Run from the media-metadata-api directory:
//   node scripts/backfill-content-types.js
//
// ContentType inference rules (applied in priority order):
//   1. tags include 'ad_art'                                    → ad_art
//      (checked BEFORE 'ad' so it takes priority)
//   2. tags include 'ad' or 'advertisement'                     → ad
//   3. tags include 'starcast_weather' AND mediaType is AUDIO   → weather_segment
//   4. tags include 'space_weather_art'
//      OR metadata.content_type = 'weather_card_image'          → weather_card_image
//   5. tag-to-type map for remaining known types
//
// stationId  — read from metadata.station_id on every record (overwrite if set)
// generatedBy — read from metadata.generated_by on every record (overwrite if set)
//
// NOTE: Agent tag inconsistency to fix during agent migration —
//   Weather agent tags records with 'stationid:stellar-lounge'  (no underscore in key)
//   Other agents tag records with  'station_id:stellar-lounge'  (underscore in key)
//   Both formats exist in the database. Standardise to 'station_id:*' when migrating agents.
'use strict';

const { PrismaClient } = require('@prisma/client');

// Tag → contentType map for standard types (checked last, after priority rules above)
const TAG_TO_CONTENT_TYPE = {
  station_break:   'station_break',
  'station-break': 'station_break',
  news:            'news_segment',
  news_segment:    'news_segment',
  show_plan:       'show_plan',
  topic_package:   'topic_package',
  persona:         'persona',
  station_image:   'station_image',
  social_post:     'social_post',
  // music_track intentionally omitted — music service hasn't run against this instance
};

function inferContentType(tags, mediaType, metadata) {
  const normalised = (tags || []).map(t => t.toLowerCase().replace(/[\s-]+/g, '_'));

  // Priority 1: ad_art (must come before 'ad' check)
  if (normalised.includes('ad_art')) return 'ad_art';

  // Priority 2: ad
  if (normalised.includes('ad') || normalised.includes('advertisement')) return 'ad';

  // Priority 3: weather audio
  if (normalised.includes('starcast_weather') && mediaType === 'AUDIO') return 'weather_segment';

  // Priority 4: weather card image
  if (
    normalised.includes('space_weather_art') ||
    (metadata && metadata.content_type === 'weather_card_image')
  ) return 'weather_card_image';

  // Priority 5: tag map
  for (const tag of normalised) {
    if (TAG_TO_CONTENT_TYPE[tag]) return TAG_TO_CONTENT_TYPE[tag];
  }

  return null;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const records = await prisma.media.findMany({
      select: { id: true, tags: true, mediaType: true, metadata: true, contentType: true, status: true },
    });

    console.log(`Found ${records.length} media records to process.`);

    let updated = 0;
    let noInference = [];

    for (const record of records) {
      const patch = {};
      const meta = record.metadata || {};

      // status — ensure set
      if (!record.status) patch.status = 'active';

      // stationId — always read from metadata.station_id
      if (meta.station_id) patch.stationId = meta.station_id;

      // generatedBy — always read from metadata.generated_by
      if (meta.generated_by) patch.generatedBy = meta.generated_by;

      // contentType — infer if not already set
      if (!record.contentType) {
        const inferred = inferContentType(record.tags, record.mediaType, meta);
        if (inferred) {
          patch.contentType = inferred;
        } else {
          noInference.push({ id: record.id, tags: record.tags, mediaType: record.mediaType });
        }
      }

      if (Object.keys(patch).length > 0) {
        await prisma.media.update({ where: { id: record.id }, data: patch });
        updated++;
        const parts = [];
        if (patch.contentType) parts.push(`contentType=${patch.contentType}`);
        if (patch.stationId)   parts.push(`stationId=${patch.stationId}`);
        if (patch.generatedBy) parts.push(`generatedBy=${patch.generatedBy}`);
        if (patch.status)      parts.push(`status=${patch.status}`);
        console.log(`  [UPDATED] ${record.id} → ${parts.join(', ')}`);
      }
    }

    // ── Count breakdown ───────────────────────────────────────────────────────
    const breakdown = await prisma.media.groupBy({
      by: ['contentType'],
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
    });

    const nullCount = await prisma.media.count({ where: { contentType: null } });

    console.log('\n── Summary ──────────────────────────────────────────────────');
    console.log(`  Total records : ${records.length}`);
    console.log(`  Updated       : ${updated}`);
    console.log(`  Could not infer contentType: ${noInference.length}`);

    console.log('\n── ContentType breakdown ─────────────────────────────────────');
    for (const row of breakdown) {
      console.log(`  ${(row.contentType || 'NULL').padEnd(22)} : ${row._count._all}`);
    }
    if (nullCount > 0) {
      console.log(`  ${'(unclassified / NULL)'.padEnd(22)} : ${nullCount}`);
    }

    if (noInference.length > 0) {
      console.log('\n── Records without inferred contentType ─────────────────────');
      for (const r of noInference) {
        console.log(`  ${r.id}  [${r.mediaType}]  tags: [${(r.tags || []).join(', ')}]`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
