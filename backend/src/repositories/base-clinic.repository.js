const supabase = require('../config/supabase');

// Base repository: owns Supabase access and automatic clinic scoping so controllers
// never query the DB directly. Authorization is clinic_id-based; dentist_id scoping
// exists only for pre-clinic accounts that have no clinic context at all.
//
// Soft delete is configurable per table:
//   softDeleteColumn: 'is_deleted'  -> filters `is_deleted = false`  (patients today)
//   softDeleteColumn: 'deleted_at'  -> filters `deleted_at IS NULL`  (after migration 004)
//   softDeleteColumn: null          -> no soft-delete filter (current visits/appointments)
class BaseClinicRepository {
  constructor(table, opts = {}) {
    this.table = table;
    this.defaultSelect = opts.select || '*';
    this.softDeleteColumn = opts.softDeleteColumn || null;
    this.defaultOrder = opts.defaultOrder || null; // { column, ascending }
  }

  _applySoftDelete(q) {
    if (this.softDeleteColumn === 'is_deleted') return q.eq('is_deleted', false);
    if (this.softDeleteColumn === 'deleted_at') return q.is('deleted_at', null);
    return q;
  }

  _scope(q, scope = {}) {
    const { clinicId, dentistId } = scope;
    // clinic_id is the multi-tenancy boundary: with clinic context, scope STRICTLY by
    // clinic_id — never OR in dentist_id, or a dentist who moved clinics would carry
    // their old clinic's rows into the new one. dentist_id applies only to pre-clinic
    // accounts (no staff row yet); their rows are adopted by createClinic's backfill
    // and migration 016.
    if (clinicId) return q.eq('clinic_id', clinicId);
    if (dentistId) return q.eq('dentist_id', dentistId);
    return q;
  }

  // Public scoped query builder — controllers may refine select/filters on top of it
  // without importing supabase directly.
  query(scope, select) {
    let q = supabase.from(this.table).select(select || this.defaultSelect);
    q = this._scope(q, scope);
    return this._applySoftDelete(q);
  }

  async findById(id, scope, select) {
    const { data, error } = await this.query(scope, select).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async findAll(scope, { select, order, from, to, filters } = {}) {
    let q = this.query(scope, select);
    const ord = order || this.defaultOrder;
    if (ord) q = q.order(ord.column, { ascending: ord.ascending !== false });
    if (filters) for (const [k, val] of Object.entries(filters)) q = q.eq(k, val);
    if (from != null && to != null) q = q.range(from, to);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async count(scope, filters) {
    let q = supabase.from(this.table).select('id', { count: 'exact', head: true });
    q = this._scope(q, scope);
    q = this._applySoftDelete(q);
    if (filters) for (const [k, val] of Object.entries(filters)) q = q.eq(k, val);
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  }

  async create(data, select) {
    const { data: row, error } = await supabase
      .from(this.table).insert(data).select(select || this.defaultSelect).single();
    if (error) throw error;
    return row;
  }

  async update(id, scope, patch, select) {
    let q = supabase.from(this.table).update(patch).eq('id', id);
    q = this._scope(q, scope);
    const { data, error } = await q.select(select || this.defaultSelect).maybeSingle();
    if (error) throw error;
    return data;
  }

  async softDelete(id, scope, staffId) {
    let patch;
    if (this.softDeleteColumn === 'deleted_at') patch = { deleted_at: new Date().toISOString(), deleted_by: staffId || null };
    else if (this.softDeleteColumn === 'is_deleted') patch = { is_deleted: true };
    else throw new Error(`softDelete not supported for ${this.table}`);
    let q = supabase.from(this.table).update(patch).eq('id', id);
    q = this._scope(q, scope);
    const { error } = await q;
    if (error) throw error;
    return true;
  }
}

module.exports = BaseClinicRepository;
