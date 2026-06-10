// Cursor-free offset pagination helpers for Supabase `.range()` based lists.

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// Parse ?page & ?limit from a request query into safe bounds + a Supabase range.
function parsePagination(query = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}

// Build the meta block returned alongside a paginated list. `count` is the total
// row count from a Supabase head/count query (may be null if not requested).
function pageMeta({ page, limit }, count) {
  const total = typeof count === 'number' ? count : null;
  return {
    page,
    limit,
    total,
    totalPages: total != null ? Math.max(1, Math.ceil(total / limit)) : null,
    hasMore: total != null ? page * limit < total : null,
  };
}

module.exports = { parsePagination, pageMeta, DEFAULT_LIMIT, MAX_LIMIT };
