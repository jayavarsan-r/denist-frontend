const Base = require('./base-clinic.repository');

// Configured repository instances.
// IMPORTANT: repos using softDeleteColumn 'deleted_at' require migration 004 to be
// applied (the column must exist or their reads error). patients keeps 'is_deleted'
// (works pre-and-post 004; backfilled by 004). queue/payments/staff/clinics have no
// soft delete (queue entries are hard-deleted; staff uses status='active').
module.exports = {
  patients:       new Base('patients',        { softDeleteColumn: 'is_deleted', defaultOrder: { column: 'name', ascending: true } }),
  visits:         new Base('visits',          { softDeleteColumn: 'deleted_at', defaultOrder: { column: 'visit_date', ascending: false } }),
  appointments:   new Base('appointments',    { softDeleteColumn: 'deleted_at', defaultOrder: { column: 'appointment_time', ascending: true } }),
  treatmentPlans: new Base('treatment_plans', { softDeleteColumn: 'deleted_at', defaultOrder: { column: 'created_at', ascending: false } }),
  prescriptions:  new Base('prescriptions',   { softDeleteColumn: 'deleted_at', defaultOrder: { column: 'created_at', ascending: false } }),
  payments:       new Base('payments',        { defaultOrder: { column: 'payment_date', ascending: false } }),
  queue:          new Base('queue_entries',   { defaultOrder: { column: 'sort_order', ascending: true } }),
  xrays:          new Base('xrays',           { softDeleteColumn: 'deleted_at', defaultOrder: { column: 'date_taken', ascending: false } }),
  labOrders:      new Base('lab_orders',      { softDeleteColumn: 'deleted_at', defaultOrder: { column: 'created_at', ascending: false } }),
  staff:          new Base('staff',           {}),
  clinics:        new Base('clinics',         {}),
  auditLogs:      new Base('audit_logs',      { defaultOrder: { column: 'created_at', ascending: false } }),
};
