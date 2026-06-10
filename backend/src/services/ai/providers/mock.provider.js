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
};
