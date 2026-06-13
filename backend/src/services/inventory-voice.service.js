// Orchestrates the inventory voice flow: load the clinic catalog → LLM extract →
// pure resolve each item → deterministic answer for query/reorder. Returns intent
// only; it NEVER writes. All writes happen later through /api/inventory/* CRUD.

const supabase = require('../config/supabase');
const aiService = require('./ai/ai.service');
const { resolveInventorySpan } = require('./inventory.service');

const CATALOG_COLS = 'id, name, strength, unit, category, stock_qty, low_stock_threshold, price_per_unit';
const CATALOG_SELECT = `${CATALOG_COLS}, aliases`;
const slim = (i) => ({ id: i.id, name: i.name, strength: i.strength || null, unit: i.unit || null, stock_qty: Number(i.stock_qty), low_stock_threshold: Number(i.low_stock_threshold) });

// Loads the clinic catalog. `aliases` (migration 019) is OPTIONAL: if the column
// isn't there yet, fall back to a select without it and default aliases to []. This
// keeps the voice feature working before the migration is run — alias matching just
// stays off until then, matching the spec's graceful-degradation guarantee.
async function loadCatalog(clinicId) {
  let { data, error } = await supabase.from('inventory_items')
    .select(CATALOG_SELECT).eq('clinic_id', clinicId).eq('active', true).order('name');
  if (error && /aliases/.test(error.message || '')) {
    ({ data, error } = await supabase.from('inventory_items')
      .select(CATALOG_COLS).eq('clinic_id', clinicId).eq('active', true).order('name'));
    if (!error) data = (data || []).map((i) => ({ ...i, aliases: [] }));
  }
  if (error) throw error;
  return data || [];
}

function lowStock(catalog) {
  return catalog.filter((i) => Number(i.stock_qty) <= Number(i.low_stock_threshold)).map(slim);
}

async function parseInventoryCommand(clinicId, transcript) {
  const catalog = await loadCatalog(clinicId);
  const raw = await aiService.extractInventory(transcript, catalog);

  const items = (raw.items || []).map((it) => {
    const res = resolveInventorySpan(catalog, it.name_span, { strength: it.strength, category: it.category });
    return { ...it, ...res };
  });

  let answer = null;
  const q = raw.query || {};
  if (raw.intent === 'reorder' || q.kind === 'low_stock') {
    answer = { kind: 'low_stock', items: lowStock(catalog) };
  } else if (raw.intent === 'query' && (q.kind === 'count' || q.kind === 'exists')) {
    const res = resolveInventorySpan(catalog, q.target_span, {});
    const item = res.resolved_item_id ? catalog.find((i) => i.id === res.resolved_item_id) : null;
    answer = {
      kind: q.kind,
      resolved_name: res.resolved_name,
      exists: !!item,
      stock_qty: item ? Number(item.stock_qty) : 0,
      unit: item ? item.unit : null,
      confidence: res.confidence,
    };
  }

  return {
    intent: raw.intent || 'unknown',
    intent_confidence: typeof raw.intent_confidence === 'number' ? raw.intent_confidence : 0,
    items,
    query: raw.query || null,
    answer,
    unclear_spans: raw.unclear_spans || [],
  };
}

module.exports = { parseInventoryCommand, loadCatalog };
