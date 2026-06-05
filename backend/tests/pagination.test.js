const { parsePagination, pageMeta } = require('../src/utils/pagination');

describe('pagination', () => {
  test('defaults to page 1 with the default limit', () => {
    const p = parsePagination({});
    expect(p.page).toBe(1);
    expect(p.from).toBe(0);
    expect(p.to).toBe(p.limit - 1);
  });

  test('computes range from page + limit', () => {
    const p = parsePagination({ page: '3', limit: '10' });
    expect(p).toMatchObject({ page: 3, limit: 10, from: 20, to: 29 });
  });

  test('clamps invalid/oversized input', () => {
    expect(parsePagination({ page: '-5', limit: '0' }).page).toBe(1);
    expect(parsePagination({ limit: '9999' }).limit).toBe(100); // MAX_LIMIT
  });

  test('pageMeta reports totals + hasMore', () => {
    expect(pageMeta({ page: 1, limit: 10 }, 25)).toMatchObject({ total: 25, totalPages: 3, hasMore: true });
    expect(pageMeta({ page: 3, limit: 10 }, 25)).toMatchObject({ hasMore: false });
    expect(pageMeta({ page: 1, limit: 10 }, null)).toMatchObject({ total: null, hasMore: null });
  });
});
