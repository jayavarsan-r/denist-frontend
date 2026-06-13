// The four-tier inbound parser. Tier 1 button → tier 2 code+keyword →
// tier 3 LLM (≥0.85 only) → tier 4 reception inbox (the unbreakable floor).

jest.mock('../../src/config/supabase', () => {
  const { makeSupabaseMock } = require('../phase2/helpers/supabase-mock');
  return makeSupabaseMock((table, calls) => global.__sbResolver(table, calls));
});
jest.mock('../../src/services/lab-case.service', () => ({
  transitionLabCase: jest.fn().mockResolvedValue({}),
  inferStatusFromKeywords: jest.requireActual('../../src/services/lab-case.service').inferStatusFromKeywords,
}));
jest.mock('../../src/services/lab-message-classifier.service', () => ({
  classifyLabMessage: jest.fn(),
}));

const sb = require('../../src/config/supabase');
const { transitionLabCase } = require('../../src/services/lab-case.service');
const { classifyLabMessage } = require('../../src/services/lab-message-classifier.service');
const { processLabMessage, normaliseBspPayload } = require('../../src/workers/whatsapp-inbound.worker');

const LAB = { id: 'L1', name: 'Smile Lab', phone_numbers: ['+919876543210'], automation_paused: false };
const MSG_ROW = { id: 'M1' };

function baseResolver(overrides = {}) {
  return (table, calls) => {
    if (table === 'lab_messages' && calls.some(([m]) => m === 'insert')) return { data: MSG_ROW, error: null };
    if (table === 'lab_messages') return { data: null, error: null }; // updates
    if (overrides[table]) return overrides[table](calls);
    return { data: null, error: null };
  };
}

const inboxWrites = () => sb._queries.filter((q) => q.table === 'reception_inbox_items');

describe('inbound lab message parser', () => {
  beforeEach(() => {
    sb._queries.length = 0;
    transitionLabCase.mockClear();
    classifyLabMessage.mockReset();
  });

  test('tier 1: button payload transitions deterministically', async () => {
    global.__sbResolver = baseResolver();
    await processLabMessage({
      clinicId: 'C1', lab: LAB, body: 'Received', mediaUrls: [], messageId: 'wa1',
      isButton: true, buttonPayload: JSON.stringify({ action: 'status', case_id: 'LC1', to: 'ACKNOWLEDGED' }),
    });
    expect(transitionLabCase).toHaveBeenCalledWith('LC1', 'ACKNOWLEDGED', 'lab_button', 'M1', 'C1');
    expect(inboxWrites()).toHaveLength(0);
  });

  test('tier 2: case code + keyword transitions; message linked', async () => {
    global.__sbResolver = baseResolver({
      lab_cases: () => ({ data: { id: 'LC2', status: 'IN_PROGRESS' }, error: null }),
    });
    await processLabMessage({
      clinicId: 'C1', lab: LAB, body: 'SR-0042 ready sir, sending tomorrow', mediaUrls: [],
      messageId: 'wa2', isButton: false, buttonPayload: null,
    });
    expect(transitionLabCase).toHaveBeenCalledWith('LC2', 'READY', 'case_code_text', 'M1', 'C1');
    expect(classifyLabMessage).not.toHaveBeenCalled(); // tier 3 never reached
  });

  test('tier 2: case code WITHOUT a keyword links the message but never transitions', async () => {
    global.__sbResolver = baseResolver({
      lab_cases: () => ({ data: { id: 'LC2', status: 'IN_PROGRESS' }, error: null }),
    });
    await processLabMessage({
      clinicId: 'C1', lab: LAB, body: 'SR-0042 shade photo attached', mediaUrls: [],
      messageId: 'wa3', isButton: false, buttonPayload: null,
    });
    expect(transitionLabCase).not.toHaveBeenCalled();
    const linkUpdate = sb._queries.find((q) => q.table === 'lab_messages' && q.calls.some(([m]) => m === 'update'));
    expect(linkUpdate.calls.find(([m]) => m === 'update')[1]).toMatchObject({ lab_case_id: 'LC2', resolved: true });
  });

  test('tier 3: LLM match ≥0.85 against open cases transitions', async () => {
    global.__sbResolver = baseResolver({
      lab_cases: () => ({ data: [{ id: 'LC3', case_code: 'SR-0001', case_type: 'crown_pfm', tooth_fdi: [36], status: 'IN_PROGRESS' }], error: null }),
    });
    classifyLabMessage.mockResolvedValue({ case_id: 'LC3', new_status: 'READY', confidence: 0.92 });
    await processLabMessage({
      clinicId: 'C1', lab: LAB, body: 'anda crown mudinjadhu, naalaikku anupuren', mediaUrls: [],
      messageId: 'wa4', isButton: false, buttonPayload: null,
    });
    expect(transitionLabCase).toHaveBeenCalledWith('LC3', 'READY', 'llm_parse', 'M1', 'C1');
  });

  test('tier 3: low confidence falls through to the reception inbox', async () => {
    global.__sbResolver = baseResolver({
      lab_cases: () => ({ data: [{ id: 'LC3', case_code: 'SR-0001', case_type: 'crown_pfm', tooth_fdi: [36], status: 'IN_PROGRESS' }], error: null }),
    });
    classifyLabMessage.mockResolvedValue({ case_id: 'LC3', new_status: 'READY', confidence: 0.6 });
    await processLabMessage({
      clinicId: 'C1', lab: LAB, body: 'that one is almost done maybe', mediaUrls: [],
      messageId: 'wa5', isButton: false, buttonPayload: null,
    });
    expect(transitionLabCase).not.toHaveBeenCalled();
    expect(inboxWrites()).toHaveLength(1);
    expect(inboxWrites()[0].calls.find(([m]) => m === 'insert')[1].type).toBe('unresolved_lab_message');
  });

  test('tier 4: unparseable text lands in the inbox with a preview', async () => {
    global.__sbResolver = baseResolver({ lab_cases: () => ({ data: [], error: null }) });
    await processLabMessage({
      clinicId: 'C1', lab: LAB, body: 'boss enna case ah?', mediaUrls: [],
      messageId: 'wa6', isButton: false, buttonPayload: null,
    });
    const payload = inboxWrites()[0].calls.find(([m]) => m === 'insert')[1].payload;
    expect(payload.labName).toBe('Smile Lab');
    expect(payload.preview).toContain('boss enna');
  });

  test('automation_paused lab skips the LLM tier (straight to inbox)', async () => {
    global.__sbResolver = baseResolver();
    await processLabMessage({
      clinicId: 'C1', lab: { ...LAB, automation_paused: true }, body: 'finished it',
      mediaUrls: [], messageId: 'wa7', isButton: false, buttonPayload: null,
    });
    expect(classifyLabMessage).not.toHaveBeenCalled();
    expect(inboxWrites()).toHaveLength(1);
  });

  test('replayed webhook (duplicate wa_message_id, 23505) is silently dropped', async () => {
    global.__sbResolver = (table, calls) => {
      if (table === 'lab_messages' && calls.some(([m]) => m === 'insert')) return { data: null, error: { code: '23505' } };
      return { data: null, error: null };
    };
    await processLabMessage({
      clinicId: 'C1', lab: LAB, body: 'SR-0042 ready', mediaUrls: [], messageId: 'wa2',
      isButton: false, buttonPayload: null,
    });
    expect(transitionLabCase).not.toHaveBeenCalled();
    expect(inboxWrites()).toHaveLength(0);
  });
});

describe('BSP payload normalisation (Meta Cloud shape)', () => {
  test('text message extracts from/to/body/messageId', () => {
    const parsed = normaliseBspPayload({
      entry: [{ changes: [{ value: {
        metadata: { display_phone_number: '+914412345678' },
        messages: [{ id: 'wamid.1', from: '919876543210', type: 'text', text: { body: 'SR-1 ready' } }],
      } }] }],
    });
    expect(parsed).toMatchObject({ from: '919876543210', to: '+914412345678', body: 'SR-1 ready', messageId: 'wamid.1', isButton: false });
  });

  test('button reply carries the payload; status events return null', () => {
    const btn = normaliseBspPayload({
      entry: [{ changes: [{ value: {
        metadata: { display_phone_number: 'x' },
        messages: [{ id: 'wamid.2', from: '91', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: '{"action":"status"}', title: 'Received' } } }],
      } }] }],
    });
    expect(btn.isButton).toBe(true);
    expect(btn.buttonPayload).toBe('{"action":"status"}');
    expect(normaliseBspPayload({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toBeNull();
  });
});
