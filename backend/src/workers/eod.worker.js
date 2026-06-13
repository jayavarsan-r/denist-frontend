const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { getQueue } = require('../jobs/queue');
const { notificationOrchestrator } = require('../services/notification-orchestrator.service');

const QUEUE_NAME = 'eod';

// End-of-day summary to each clinic owner: patients seen, money collected,
// tomorrow's appointments, overdue lab cases, low stock. Plain aggregation —
// no AI needed for a five-number summary.
async function generateEodSummary(clinic) {
  const clinicId = clinic.id;
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const safe = async (p, fallback) => { try { return await p; } catch { return fallback; } };

  const [paymentsRes, visitsRes, apptsRes, labRes, stockRes] = await Promise.all([
    safe(supabase.from('payments').select('amount').eq('clinic_id', clinicId).eq('payment_date', today), { data: [] }),
    safe(supabase.from('visits').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('visit_date', today), { count: 0 }),
    safe(supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('appointment_date', tomorrow).neq('status', 'cancelled'), { count: 0 }),
    safe(supabase.from('lab_cases').select('case_code').eq('clinic_id', clinicId)
      .not('status', 'in', '(RECEIVED,FITTED,CANCELLED)').lte('expected_date', today), { data: [] }),
    safe(supabase.from('inventory_items').select('name, stock_qty, low_stock_threshold').eq('clinic_id', clinicId).eq('active', true), { data: [] }),
  ]);

  const collected = (paymentsRes.data || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const patientsSeen = visitsRes.count || 0;
  const apptsTomorrow = apptsRes.count || 0;
  const overdueLab = (labRes.data || []).map((c) => c.case_code);
  const lowStock = (stockRes.data || [])
    .filter((i) => Number(i.stock_qty) <= Number(i.low_stock_threshold))
    .map((i) => i.name);

  const parts = [
    `${patientsSeen} patients seen today.`,
    `₹${collected} collected.`,
    `${apptsTomorrow} appointments tomorrow.`,
  ];
  if (overdueLab.length) parts.push(`Lab overdue: ${overdueLab.slice(0, 5).join(', ')}.`);
  if (lowStock.length) parts.push(`Low stock: ${lowStock.slice(0, 5).join(', ')}.`);
  return parts.join(' ');
}

async function runEodForAllClinics() {
  const { data: clinics } = await supabase.from('clinics').select('id, name, owner_phone');
  for (const clinic of clinics || []) {
    if (!clinic.owner_phone) continue;
    try {
      const summaryText = await generateEodSummary(clinic);
      await notificationOrchestrator.emit('eod_summary', {
        clinicId: clinic.id, summaryText, ownerPhone: clinic.owner_phone,
      });
    } catch (e) {
      logger.error('[eod] failed for clinic', { clinicId: clinic.id, err: e.message });
    }
  }
}

async function registerEodWorker() {
  const boss = getQueue();
  await boss.createQueue(QUEUE_NAME);
  // 18:00 IST daily (pg-boss v10 cron signature: schedule(queue, cron, data, opts)).
  await boss.schedule(QUEUE_NAME, '0 18 * * *', {}, { tz: 'Asia/Kolkata' });
  await boss.work(QUEUE_NAME, { batchSize: 1 }, async () => runEodForAllClinics());
  logger.info('[eod.worker] registered (18:00 IST daily)');
}

module.exports = { registerEodWorker, generateEodSummary, runEodForAllClinics, QUEUE_NAME };
