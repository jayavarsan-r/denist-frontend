const gemini = require('./ai/providers/gemini.provider');
const logger = require('../utils/logger');

// Tier 3 of the inbound parser: Gemini matches a free-text lab message to ONE of
// the lab's open cases. Conservative by design — the caller only acts on
// confidence ≥ 0.85; anything else falls through to the reception inbox (tier 4).
// Never throws: a classifier failure is just "couldn't classify".
const SYSTEM = `You match dental lab WhatsApp messages to open lab cases. The lab may write in English, Tamil, or a mix.

Respond ONLY with JSON: {"case_id": "<uuid or null>", "new_status": "<status or null>", "confidence": <0.0-1.0>}

Rules:
- case_id MUST be one of the listed case IDs, or null.
- Valid new_status values: ACKNOWLEDGED, IN_PROGRESS, READY, DISPATCHED, ISSUE_RAISED — or null.
- confidence 1.0 = certain, 0.5 = unsure, 0.0 = cannot determine.
- Do NOT guess. If the message could be about more than one case, or the status is unclear, return nulls with low confidence. A wrong match is far worse than no match.`;

const VALID = ['ACKNOWLEDGED', 'IN_PROGRESS', 'READY', 'DISPATCHED', 'ISSUE_RAISED'];

async function classifyLabMessage(text, openCases) {
  try {
    if (!gemini.hasKey()) return { case_id: null, new_status: null, confidence: 0 };

    const caseList = openCases.map((c) =>
      `  - ID: ${c.id} | Code: ${c.case_code} | Type: ${c.case_type} | Teeth: ${(c.tooth_fdi || []).join(',') || '?'} | Status: ${c.status}`
    ).join('\n');

    const data = await gemini.generate(SYSTEM,
      `Lab message: "${text}"\n\nOpen cases for this lab:\n${caseList}\n\nWhich case is this about, and what is the new status?`,
      { temperature: 0, maxOutputTokens: 200 });

    const caseId = openCases.some((c) => c.id === data?.case_id) ? data.case_id : null;
    const newStatus = VALID.includes(data?.new_status) ? data.new_status : null;
    const confidence = typeof data?.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0;
    return { case_id: caseId, new_status: caseId ? newStatus : null, confidence: caseId && newStatus ? confidence : 0 };
  } catch (e) {
    logger.warn('[lab-classifier] failed (falls through to reception inbox)', { err: e.message });
    return { case_id: null, new_status: null, confidence: 0 };
  }
}

module.exports = { classifyLabMessage };
