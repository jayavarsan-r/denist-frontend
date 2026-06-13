// Development-only mock provider. Activated ONLY when a provider key is absent and
// NODE_ENV !== 'production' (the server fails fast in production if keys are missing,
// so this never runs there). Keeps local dev / clinic-testing working without keys.

module.exports = {
  transcribe() {
    return {
      transcript: 'Root canal completed on tooth 26. Temporary crown placed. Patient tolerated procedure well. Follow up in 7 days.',
      raw: { mock: true },
    };
  },

  clinicalNote(transcript) {
    return {
      procedure: 'Dental Consultation',
      toothNumber: null,
      status: 'completed',
      notes: transcript || 'Visit completed.',
      medications: null,
      nextSteps: null,
      followUpDays: null,
      followUpDate: null,
      cost: null,
      currency: 'INR',
      totalSittings: null,
      remainingSittings: null,
      isMultiSitting: false,
      treatmentPlanSuggested: false,
      assignedDoctor: null,
    };
  },

  prescription() {
    return {
      medicines: [
        { name: 'Amoxicillin', dose: '500 mg', frequency: 'Three times daily', duration: '5 days', timing: 'After meals', instructions: 'Complete the full course. Do not stop early even if you feel better.', meal_timing_slots: { breakfast: true, lunch: true, dinner: true } },
        { name: 'Ibuprofen', dose: '400 mg', frequency: 'Twice daily', duration: '3 days', timing: 'After food', instructions: 'Take with food or milk. Avoid on empty stomach.', meal_timing_slots: { breakfast: true, lunch: false, dinner: true } },
      ],
      instructions: 'Avoid hard and crunchy foods for 3 days. Rinse with warm salt water after meals. Do not smoke or consume alcohol while on these medications.',
      followUp: 'Review after 5 days or earlier if pain increases.',
    };
  },

  queueContext(transcript) {
    return { name: null, age: null, phone: null, chiefComplaint: transcript || null, bloodGroup: null, flags: {} };
  },

  // Dev-only stub for inventory voice when GEMINI_API_KEY is absent.
  inventory(transcript = '') {
    const t = String(transcript).toLowerCase();
    if (t.includes('low') || t.includes('reorder')) {
      return { intent: 'reorder', intent_confidence: 0.9, items: [], query: { kind: 'low_stock', target_span: null }, unclear_spans: [] };
    }
    return {
      intent: 'restock', intent_confidence: 0.8,
      items: [{ name_span: 'gloves', strength: null, unit: 'box', category: 'consumable', qty: 50, set_to_level: null, price_per_unit: null, low_stock_threshold: null }],
      query: null, unclear_spans: [],
    };
  },
};
