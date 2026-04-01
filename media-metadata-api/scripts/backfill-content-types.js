// scripts/backfill-content-types.js
//
// Backfills contentType and ensures status='active' on all existing Media records.
//
// Run from the media-metadata-api directory:
//   node scripts/backfill-content-types.js
//
// Infers contentType from the record's tags array using the mapping below.
// Records whose tags don't match any known type are logged and left unchanged.
'use strict';

const { PrismaClient } = require('@prisma/client');

// Map tag values (lowercased + underscored) → contentType
const TAG_TO_CONTENT_TYPE = {
  station_break:   'station_break',
  'station-break': 'station_break',
  news:            'news_segment',
  news_segment:    'news_segment',
  weather:         'weather_segment',
  weather_segment: 'weather_segment',
  advertisement:   'ad',
  ad:              'ad',
  music:           'music_track',
  music_track:     'music_track',
  show_plan:       'show_plan',
  topic_package:   'topic_package',
  persona:         'persona',
  station_image:   'station_image',
  social_post:     'social_post',
};

async function main() {
  const prisma = new PrismaClient();

  try {
    const records = await prisma.media.findMany({
      select: { id: true, tags: true, contentType: true, status: true },
    });

    console.log(`Found ${records.length} media records to process.`);

    let updated = 0;
    let alreadySet = 0;
    let noInference = [];

    for (const record of records) {
      const patch = {};

      // Ensure status is set (column DEFAULT handles new rows; this covers old nulls)
      if (!record.status) {
        patch.status = 'active';
      }

      // Only infer contentType if not already set
      if (!record.contentType) {
        let inferred = null;
        for (const tag of (record.tags || [])) {
          const key = tag.toLowerCase().replace(/[\s-]+/g, '_');
          if (TAG_TO_CONTENT_TYPE[key]) {
            inferred = TAG_TO_CONTENT_TYPE[key];
            break;
          }
        }

        if (inferred) {
          patch.contentType = inferred;
        } else {
          noInference.push({ id: record.id, tags: record.tags });
        }
      } else {
        alreadySet++;
      }

      if (Object.keys(patch).length > 0) {
        await prisma.media.update({ where: { id: record.id }, data: patch });
        updated++;
        console.log(`  [UPDATED] ${record.id}${patch.contentType ? ` → contentType=${patch.contentType}` : ''}${patch.status ? ` → status=${patch.status}` : ''}`);
      }
    }

    console.log('\n── Summary ──────────────────────────────────────────────────');
    console.log(`  Total records   : ${records.length}`);
    console.log(`  Updated         : ${updated}`);
    console.log(`  Already had type: ${alreadySet}`);
    console.log(`  Could not infer : ${noInference.length}`);

    if (noInference.length > 0) {
      console.log('\n── Records without inferred contentType ─────────────────────');
      for (const r of noInference) {
        console.log(`  ${r.id}  tags: [${r.tags.join(', ')}]`);
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
