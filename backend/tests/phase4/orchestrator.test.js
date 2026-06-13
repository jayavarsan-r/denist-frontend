// Notification orchestrator: feature-flag gating + notification_logs shape.

jest.mock('../../src/config/supabase', () => {
  const { makeSupabaseMock } = require('../phase2/helpers/supabase-mock');
  return makeSupabaseMock((table, calls) => global.__sbResolver(table, calls));
});

const sb = require('../../src/config/supabase');
const { handleNotificationEvent, flagAllows } = require('../../src/services/notification-orchestrator.service');

const PATIENT = { id: 'P1', name: 'Asha', phone: '9876543210', preferred_language: 'ta', whatsapp_opted_in: true };

function resolver(overrides = {}) {
  return (table, calls) => {
    if (table === 'patients') return { data: overrides.patient ?? PATIENT, error: null };
    if (table === 'clinics') return { data: { name: 'Sunrise Dental', whatsapp_number: '+9144', owner_phone: '9' }, error: null };
    if (table === 'notification_logs') return { data: null, error: null };
    return { data: null, error: null };
  };
}

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

describe('feature flag gating', () => {
  test('patient + lab flags gate their template families independently', () => {
    process.env.FEATURE_WHATSAPP_PATIENT_REMINDERS = 'false';
    process.env.FEATURE_WHATSAPP_LAB_OUTBOUND = 'true';
    expect(flagAllows('appt_reminder_24h')).toBe(false);
    expect(flagAllows('lab_case_new')).toBe(true);
    process.env.FEATURE_WHATSAPP_PATIENT_REMINDERS = 'true';
    expect(flagAllows('payment_receipt')).toBe(true);
    expect(flagAllows('totally_unknown')).toBe(false);
  });

  test('flag off: handler runs but nothing is sent or logged', async () => {
    process.env.FEATURE_WHATSAPP_PATIENT_REMINDERS = 'false';
    sb._queries.length = 0;
    global.__sbResolver = resolver();
    await handleNotificationEvent('appointment_reminder', {
      patientId: 'P1', clinicId: 'C1', appointmentId: 'A1', date: '2026-06-13', time: '10:00',
    });
    expect(sb._queries.find((q) => q.table === 'notification_logs')).toBeUndefined();
  });
});

describe('sending (stub provider)', () => {
  test('flag on: sends via stub and logs the existing notification_logs shape', async () => {
    process.env.FEATURE_WHATSAPP_PATIENT_REMINDERS = 'true';
    process.env.WHATSAPP_PROVIDER = 'stub';
    sb._queries.length = 0;
    global.__sbResolver = resolver();

    await handleNotificationEvent('appointment_reminder', {
      patientId: 'P1', clinicId: 'C1', appointmentId: 'A1', date: '2026-06-13', time: '10:00', type: '24h',
    });

    const log = sb._queries.find((q) => q.table === 'notification_logs');
    const row = log.calls.find(([m]) => m === 'insert')[1];
    expect(row).toMatchObject({ clinic_id: 'C1', patient_id: 'P1', type: 'appt_reminder_24h', channel: 'whatsapp', status: 'sent' });
    expect(row.provider_message_id).toMatch(/^stub_/);
    expect(row.payload.templateName).toBe('dentai_appt_reminder_24h_ta'); // patient prefers Tamil
  });

  test('opt-in is the hard gate: no whatsapp_opted_in → no send, no log', async () => {
    process.env.FEATURE_WHATSAPP_PATIENT_REMINDERS = 'true';
    sb._queries.length = 0;
    global.__sbResolver = resolver({ patient: { ...PATIENT, whatsapp_opted_in: false } });
    await handleNotificationEvent('appointment_reminder', {
      patientId: 'P1', clinicId: 'C1', appointmentId: 'A1', date: '2026-06-13', time: '10:00',
    });
    expect(sb._queries.find((q) => q.table === 'notification_logs')).toBeUndefined();
  });

  test('unknown events warn and no-op (forward compatibility)', async () => {
    await expect(handleNotificationEvent('not_a_real_event', {})).resolves.toBeUndefined();
  });
});
