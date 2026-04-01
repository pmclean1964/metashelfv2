// src/controllers/media.v2.controller.js
'use strict';

/**
 * Express middleware applied to all v2 routes.
 * Overrides res.json to wrap responses in the v2 envelope:
 *   { data: <payload>, pagination: { total, page, pageSize, hasMore } }
 *
 * Special cases:
 *  - Count response { count: N }             → passed through unchanged
 *  - List response { data, pagination }      → pagination converted to hasMore form
 *  - Everything else (single record, delete) → wrapped as single-item envelope
 */
function wrapEnvelope(req, res, next) {
  const _json = res.json.bind(res);

  res.json = function (body) {
    if (body == null) return _json(body);

    // Count endpoint returns { count: N } — pass through as-is
    if (typeof body.count === 'number' && Object.keys(body).length === 1) {
      return _json(body);
    }

    // List response already shaped as { data: [...], pagination: {...} }
    // Transform pagination: drop totalPages, add hasMore
    if (body.data !== undefined && body.pagination) {
      const { total, page, pageSize } = body.pagination;
      const p = Number(page);
      const ps = Number(pageSize);
      const t = Number(total);
      return _json({
        data: body.data,
        pagination: {
          total: t,
          page: p,
          pageSize: ps,
          hasMore: p * ps < t,
        },
      });
    }

    // Single item or primitive — wrap in envelope
    return _json({
      data: body,
      pagination: { total: 1, page: 1, pageSize: 1, hasMore: false },
    });
  };

  next();
}

module.exports = { wrapEnvelope };
