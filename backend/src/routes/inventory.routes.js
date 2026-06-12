const router = require('express').Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireClinic = require('../middleware/requireClinic');
const requireClinicOwnership = require('../middleware/requireClinicOwnership');
const validate = require('../middleware/validate');
const v = require('../validators');
const { recordStockMovement } = require('../services/inventory.service');
const audit = require('../services/audit.service');

// Inventory is clinic infrastructure — every route requires clinic context and
// every query is clinic_id-scoped. Stock changes ONLY happen through the
// movements ledger (stock-in / adjustment), never by patching stock_qty.
router.use(auth, requireClinic);

// GET /api/inventory — list. ?category=medicine|consumable|equipment,
// ?low_stock=true, ?search=amox, ?active=false (default: active only).
router.get('/', async (req, res, next) => {
  try {
    const { category, low_stock: lowStock, search, active } = req.query;
    let q = supabase.from('inventory_items')
      .select('*').eq('clinic_id', req.clinicId).order('name');
    if (category) q = q.eq('category', category);
    if (active !== 'false') q = q.eq('active', true);
    if (search) q = q.ilike('name', `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    // Column-to-column comparison (stock <= threshold) isn't expressible in a
    // PostgREST filter — at clinic scale (~hundreds of rows) JS filtering is fine.
    const items = lowStock === 'true'
      ? (data || []).filter((i) => Number(i.stock_qty) <= Number(i.low_stock_threshold))
      : (data || []);
    res.json({ items });
  } catch (e) { next(e); }
});

// GET /api/inventory/low-stock — EOD summary + dashboard alert feed.
router.get('/low-stock', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('inventory_items')
      .select('id, name, strength, unit, stock_qty, low_stock_threshold, category')
      .eq('clinic_id', req.clinicId).eq('active', true).order('name');
    if (error) throw error;
    res.json({ items: (data || []).filter((i) => Number(i.stock_qty) <= Number(i.low_stock_threshold)) });
  } catch (e) { next(e); }
});

// GET /api/inventory/medicines — lightweight list for the prescription UI.
router.get('/medicines', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('inventory_items')
      .select('id, name, strength, unit, price_per_unit, stock_qty, low_stock_threshold')
      .eq('clinic_id', req.clinicId).eq('category', 'medicine').eq('active', true)
      .order('name');
    if (error) throw error;
    res.json({ medicines: data || [] });
  } catch (e) { next(e); }
});

// POST /api/inventory — add item.
router.post('/', validate(v.createInventoryItem), async (req, res, next) => {
  try {
    const { category, name, strength, unit, price_per_unit, stock_qty, low_stock_threshold, notes } = req.body;
    const { data, error } = await supabase.from('inventory_items')
      .insert({
        clinic_id: req.clinicId, category, name, strength: strength || null, unit,
        price_per_unit: price_per_unit ?? null, stock_qty, low_stock_threshold, notes: notes || null,
      })
      .select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'item_already_exists' });
      throw error;
    }
    // Opening stock enters the ledger too, so the movement history is complete.
    if (Number(stock_qty) > 0) {
      await supabase.from('stock_movements').insert({
        clinic_id: req.clinicId, item_id: data.id, direction: 'in', qty: stock_qty,
        reason: 'purchase', notes: 'Opening stock', created_by: req.staffId || null,
      });
    }
    audit.log({ clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      action: 'CREATE', entityType: 'inventory_item', entityId: data.id, metadata: { name: data.name } });
    res.status(201).json({ item: data });
  } catch (e) { next(e); }
});

// PATCH /api/inventory/:id — details only; stock changes go through the ledger.
router.patch('/:id', requireClinicOwnership('inventory_items'), validate(v.updateInventoryItem), async (req, res, next) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    if (updates.strength !== undefined) updates.strength = updates.strength || null;
    const { data, error } = await supabase.from('inventory_items')
      .update(updates).eq('id', req.params.id).eq('clinic_id', req.clinicId)
      .select().single();
    if (error) throw error;
    res.json({ item: data });
  } catch (e) { next(e); }
});

// POST /api/inventory/:id/stock-in — purchase / restock.
router.post('/:id/stock-in', requireClinicOwnership('inventory_items'), validate(v.stockIn), async (req, res, next) => {
  try {
    const result = await recordStockMovement({
      clinicId: req.clinicId, itemId: req.params.id, direction: 'in',
      qty: req.body.qty, reason: 'purchase', notes: req.body.notes, createdBy: req.staffId,
    });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result.data);
  } catch (e) { next(e); }
});

// POST /api/inventory/:id/adjustment — manual correction (count/expired/return).
router.post('/:id/adjustment', requireClinicOwnership('inventory_items'), validate(v.stockAdjust), async (req, res, next) => {
  try {
    const { qty, direction, reason, notes } = req.body;
    const result = await recordStockMovement({
      clinicId: req.clinicId, itemId: req.params.id, direction, qty, reason, notes, createdBy: req.staffId,
    });
    if (result.error === 'insufficient_stock') {
      return res.status(409).json({ error: 'insufficient_stock', available: result.available });
    }
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result.data);
  } catch (e) { next(e); }
});

// GET /api/inventory/:id/movements — ledger history for one item.
router.get('/:id/movements', requireClinicOwnership('inventory_items'), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('stock_movements')
      .select('*, staff:created_by(name)')
      .eq('item_id', req.params.id).eq('clinic_id', req.clinicId)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json({ movements: data || [] });
  } catch (e) { next(e); }
});

module.exports = router;
