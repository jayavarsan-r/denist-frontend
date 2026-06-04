// Pagination helpers used by all list endpoints

function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginationMeta(total, limit, page) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

module.exports = { parsePagination, paginationMeta };
