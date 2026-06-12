const supabase = require('../config/supabase');
const logger = require('../utils/logger');

// ── Stock ledger ──────────────────────────────────────────────────────────────
// THE single entry point for every stock change: updates inventory_items.stock_qty
// and appends a stock_movements row. Never update stock_qty directly anywhere else.
//
// NOTE: read-modify-write without a row lock (supabase-js has no cross-statement
// transaction) — same documented trade-off as recordPayment's balance sync. At
// clinic scale concurrent movements on the SAME item are rare; an RPC is the
// long-term fix if drift is ever observed.
async function recordStockMovement({ clinicId, itemId, direction, qty, reason, referenceId, notes, createdBy }) {
  const amount = parseFloat(qty);
  if (!amount || amount <= 0) return { error: 'qty_must_be_positive' };
  if (!['in', 'out'].includes(direction)) return { error: 'invalid_direction' };

  const { data: item, error: fetchErr } = await supabase
    .from('inventory_items')
    .select('id, stock_qty, name')
    .eq('id', itemId).eq('clinic_id', clinicId)
    .maybeSingle();
  if (fetchErr || !item) return { error: 'item_not_found' };

  const delta = direction === 'in' ? amount : -amount;
  const newQty = Number(item.stock_qty) + delta;
  if (newQty < 0) {
    return { error: 'insufficient_stock', available: Number(item.stock_qty) };
  }

  const { error: updateErr } = await supabase
    .from('inventory_items')
    .update({ stock_qty: newQty, updated_at: new Date().toISOString() })
    .eq('id', itemId).eq('clinic_id', clinicId);
  if (updateErr) return { error: updateErr.message };

  const { data: movement, error: movErr } = await supabase
    .from('stock_movements')
    .insert({
      clinic_id: clinicId,
      item_id: itemId,
      direction,
      qty: amount,
      reason,
      reference_id: referenceId ?? null,
      notes: notes ?? null,
      created_by: createdBy ?? null,
    })
    .select().single();
  if (movErr) return { error: movErr.message };

  return { data: { movement, new_qty: newQty } };
}

// Checkout dispensing: one 'out' movement per dispensed, RESOLVED medicine.
// Never throws and never blocks checkout — stock accuracy matters, but the
// patient walking out matters more. Failures come back as per-item results for
// the caller to log/surface.
async function dispenseMedicinesAtCheckout({ clinicId, visitId, medicines, staffId }) {
  const results = [];
  for (const m of medicines || []) {
    const itemId = m.resolved_item_id || m.item_id;
    const qty = parseFloat(m.qty_dispensed);
    if (!itemId || !qty || qty <= 0) continue; // unresolved or not dispensed — skip silently

    const result = await recordStockMovement({
      clinicId,
      itemId,
      direction: 'out',
      qty,
      reason: 'dispensed_checkout',
      referenceId: visitId ?? null,
      notes: visitId ? `Dispensed at checkout (visit ${visitId})` : 'Dispensed at checkout',
      createdBy: staffId ?? null,
    });
    results.push({ item_id: itemId, qty, ...result });

    if (result.error === 'insufficient_stock') {
      logger.warn('[inventory] insufficient stock at checkout — checkout continues', {
        itemId, requested: qty, available: result.available,
      });
    }
  }
  return results;
}

// ── Medicine resolution (used by the voice worker) ────────────────────────────
// Spoken span → inventory item. Strategy: exact name match → first-word prefix
// (single candidate = confident; multiple = disambiguate on a spoken strength
// like "500mg") → unresolved. Returns the resolution fields the Verification
// Card renders. Never throws — resolution is best-effort decoration.
const RESOLVE_SELECT = 'id, name, strength, unit, price_per_unit, stock_qty, low_stock_threshold';

function decorate(rx, item, confident) {
  return {
    ...rx,
    resolved_item_id:     item?.id ?? null,
    resolved_name:        item?.name ?? rx.medicine_name_span,
    resolved_strength:    item?.strength ?? null,
    price_per_unit:       item?.price_per_unit ?? null,
    stock_qty:            item?.stock_qty ?? null,
    low_stock_threshold:  item?.low_stock_threshold ?? null,
    resolution_confident: !!(item && confident),
  };
}

async function resolveMedicineSpan(clinicId, rx) {
  try {
    const span = (rx.medicine_name_span || '').trim();
    if (!span) return decorate(rx, null, false);

    const base = () => supabase.from('inventory_items')
      .select(RESOLVE_SELECT)
      .eq('clinic_id', clinicId).eq('category', 'medicine').eq('active', true);

    // 1. Exact name match (case-insensitive)
    const { data: exactRows } = await base().ilike('name', span).limit(1);
    if (exactRows?.[0]) return decorate(rx, exactRows[0], true);

    // 2. First-word prefix ("Amoxicillin 500 three times daily" → "Amoxicillin%")
    const firstWord = span.split(/\s+/)[0];
    const { data: fuzzy } = await base().ilike('name', `${firstWord}%`).order('name').limit(3);
    if (!fuzzy?.length) return decorate(rx, null, false);
    if (fuzzy.length === 1) return decorate(rx, fuzzy[0], true);

    // 3. Multiple candidates — disambiguate on a spoken strength ("500mg"/"10 ml")
    const strengthHint = span.match(/\d+\s*(mg|ml|g|%)/i)?.[0]?.replace(/\s/g, '').toLowerCase();
    if (strengthHint) {
      const match = fuzzy.find((m) => (m.strength || '').replace(/\s/g, '').toLowerCase() === strengthHint);
      if (match) return decorate(rx, match, true);
    }
    // Ambiguous — surface the first candidate but flag it for the doctor (amber).
    return decorate(rx, fuzzy[0], false);
  } catch {
    return decorate(rx, null, false); // table missing / transient error — unresolved
  }
}

module.exports = { recordStockMovement, dispenseMedicinesAtCheckout, resolveMedicineSpan };
