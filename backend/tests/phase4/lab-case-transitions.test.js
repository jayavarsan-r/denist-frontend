// The state machine: validity, idempotency, the reception_manual override, and
// the compare-and-swap race guard. The DB is the truth — invalid triggers bounce.

jest.mock('../../src/config/supabase', () => {
  const { makeSupabaseMock } = require('../phase2/helpers/supabase-mock');
  return makeSupabaseMock((table, calls) => global.__sbResolver(table, calls));
});
jest.mock('../../src/services/notification-orchestrator.service', () => ({
  notificationOrchestrator: { emit: jest.fn().mockResolvedValue(undefined) },
}));

const sb = require('../../src/config/supabase');
const { notificationOrchestrator } = require('../../src/services/notification-orchestrator.service');
const { transitionLabCase, inferStatusFromKeywords, VALID_TRANSITIONS } = require('../../src/services/lab-case.service');

const CASE = { id: 'LC1', status: 'SENT', lab_id: 'L1', patient_id: 'P1', expected_date: null, case_code: 'SR-0001' };

function resolverFor({ current, casSucceeds = true }) {
  return (table, calls) => {
    if (table === 'lab_cases') {
      const isUpdate = calls.some(([m]) => m === 'update');
      if (!isUpdate) return { data: { ...CASE, status: current }, error: null };
      return { data: casSucceeds ? { ...CASE, status: calls.find(([m]) => m === 'update')[1].status } : null, error: null };
    }
    return { data: null, error: null };
  };
}

describe('lab case state machine', () => {
  beforeEach(() => { sb._queries.length = 0; notificationOrchestrator.emit.mockClear(); });

  test('valid transition applies, audits, and fires side effects', async () => {
    global.__sbResolver = resolverFor({ current: 'SENT' });
    const out = await transitionLabCase('LC1', 'ACKNOWLEDGED', 'lab_button', 'M1', 'C1');
    expect(out.status).toBe('ACKNOWLEDGED');
    const event = sb._queries.find((q) => q.table === 'lab_case_events');
    expect(event.calls.find(([m]) => m === 'insert')[1]).toMatchObject({
      from_status: 'SENT', to_status: 'ACKNOWLEDGED', trigger: 'lab_button', source_message_id: 'M1',
    });
  });

  test('invalid transition throws and writes nothing', async () => {
    global.__sbResolver = resolverFor({ current: 'DISPATCHED' });
    await expect(transitionLabCase('LC1', 'READY', 'llm_parse', null, 'C1'))
      .rejects.toThrow(/invalid_transition: DISPATCHED → READY/);
    expect(sb._queries.find((q) => q.table === 'lab_case_events')).toBeUndefined();
  });

  test('idempotent: already in target status is a clean no-op (webhook replays)', async () => {
    global.__sbResolver = resolverFor({ current: 'READY' });
    const out = await transitionLabCase('LC1', 'READY', 'lab_button', null, 'C1');
    expect(out.status).toBe('READY');
    expect(sb._queries.filter((q) => q.table === 'lab_cases' && q.calls.some(([m]) => m === 'update'))).toHaveLength(0);
  });

  test('reception_manual may move backward (the manual tracker is unbreakable)', async () => {
    global.__sbResolver = resolverFor({ current: 'READY' });
    const out = await transitionLabCase('LC1', 'IN_PROGRESS', 'reception_manual', null, 'C1');
    expect(out.status).toBe('IN_PROGRESS');
  });

  test('lost CAS race: another trigger moved the case first → no-op, no event', async () => {
    global.__sbResolver = resolverFor({ current: 'SENT', casSucceeds: false });
    const out = await transitionLabCase('LC1', 'ACKNOWLEDGED', 'lab_button', null, 'C1');
    expect(out.status).toBe('SENT'); // unchanged snapshot returned
    expect(sb._queries.find((q) => q.table === 'lab_case_events')).toBeUndefined();
  });

  test('SENT fires the lab_case_new notification side effect', async () => {
    global.__sbResolver = resolverFor({ current: 'DRAFT' });
    await transitionLabCase('LC1', 'SENT', 'reception_manual', null, 'C1');
    await new Promise((r) => setImmediate(r)); // side effects are fire-and-forget
    expect(notificationOrchestrator.emit).toHaveBeenCalledWith('lab_case_new', { caseId: 'LC1', clinicId: 'C1' });
  });

  test('every status in the map is reachable or terminal', () => {
    const all = Object.keys(VALID_TRANSITIONS);
    const reachable = new Set(['DRAFT', ...Object.values(VALID_TRANSITIONS).flat()]);
    all.forEach((s) => expect(reachable.has(s)).toBe(true));
    expect(VALID_TRANSITIONS.FITTED).toEqual([]);
    expect(VALID_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe('keyword inference (tier 2)', () => {
  test.each([
    ['SR-42 ready sir', 'READY'],
    ['crown aachu, send boy', 'READY'],
    ['தயார்', 'READY'],
    ['problem with margin, remake needed', 'ISSUE_RAISED'],
    ['sent with courier today', 'DISPATCHED'],
    ['work in progress', 'IN_PROGRESS'],
    ['ok got it', 'ACKNOWLEDGED'],
    ['hello doctor', null],
  ])('"%s" → %s', (text, expected) => {
    expect(inferStatusFromKeywords(text)).toBe(expected);
  });
});
