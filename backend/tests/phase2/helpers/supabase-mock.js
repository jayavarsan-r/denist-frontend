// Chainable, awaitable supabase-js mock. Configure a resolver per test:
//
//   const sb = makeSupabaseMock((table, calls) => {
//     if (table === 'consultation_drafts') return { data: {...}, error: null };
//     return { data: [], error: null };
//   });
//
// Every query records [method, ...args] in calls; the resolver runs when the
// query is awaited (or .single()/.maybeSingle() is called). sb._queries keeps
// every executed query for assertions: { table, calls }.

function makeSupabaseMock(resolver) {
  const _queries = [];

  function builder(table) {
    const calls = [];
    const q = {};
    const record = { table, calls };

    const CHAIN = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'not',
      'gte', 'lte', 'gt', 'lt', 'or', 'ilike', 'order', 'range', 'limit'];
    CHAIN.forEach((m) => {
      q[m] = (...args) => { calls.push([m, ...args]); return q; };
    });

    const resolve = () => {
      _queries.push(record);
      return Promise.resolve(resolver(table, calls));
    };
    q.single = () => { calls.push(['single']); return resolve(); };
    q.maybeSingle = () => { calls.push(['maybeSingle']); return resolve(); };
    // awaitable: `const { data } = await q` without single()
    q.then = (onFulfilled, onRejected) => resolve().then(onFulfilled, onRejected);

    return q;
  }

  const storageDownloads = [];
  return {
    from: (table) => builder(table),
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          storageDownloads.push({ bucket, path });
          // a tiny fake audio blob
          return { data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null };
        },
        upload: async () => ({ data: { path: 'mock/path.webm' }, error: null }),
      }),
    },
    _queries,
    _storageDownloads: storageDownloads,
  };
}

module.exports = { makeSupabaseMock };
