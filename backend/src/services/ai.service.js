const axios = require('axios');

async function extractPrescription(voiceText) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const noKey = !geminiKey || geminiKey.startsWith('your_');

  if (noKey) {
    return {
      medicines: [
        { name: 'Amoxicillin', dose: '500 mg', frequency: 'Three times daily', duration: '5 days', timing: 'After meals', instructions: 'Complete the full course. Do not stop early even if you feel better.', meal_timing_slots: { breakfast: true, lunch: true, dinner: true } },
        { name: 'Ibuprofen', dose: '400 mg', frequency: 'Twice daily', duration: '3 days', timing: 'After food', instructions: 'Take with food or milk. Avoid on empty stomach.', meal_timing_slots: { breakfast: true, lunch: false, dinner: true } },
      ],
      instructions: 'Avoid hard and crunchy foods for 3 days. Rinse with warm salt water after meals. Do not smoke or consume alcohol while on these medications.',
      followUp: 'Review after 5 days or earlier if pain increases.',
    };
  }

  const prompt = `You are an expert dental prescription assistant for an Indian dental clinic. A dentist has dictated a prescription by voice. Your job is to extract and format it into a clean, professional prescription.

Return ONLY valid JSON with this exact schema — no markdown, no explanation, no code blocks:

{
  "medicines": [
    {
      "name": "Full medicine name, correctly spelled (e.g. Amoxicillin, Ibuprofen, Metronidazole, Diclofenac, Paracetamol, Pantoprazole)",
      "dose": "Dose with units (e.g. 500 mg, 400 mg, 250 mg/5 ml)",
      "frequency": "Human-readable frequency (e.g. Three times daily, Twice daily, Once at night, Every 8 hours)",
      "duration": "Duration in days (e.g. 3 days, 5 days, 7 days)",
      "timing": "EXACTLY one of: Before meals | After meals | With meals | At bedtime | On empty stomach | As needed",
      "instructions": "One clear patient-friendly sentence about how to take this medicine. Include any warnings.",
      "meal_timing_slots": {
        "breakfast": "boolean — true if dose should be taken at breakfast time",
        "lunch": "boolean — true if dose should be taken at lunch time",
        "dinner": "boolean — true if dose should be taken at dinner time"
      }
    }
  ],
  "instructions": "2-3 sentences of post-treatment care instructions for the patient (diet, hygiene, activity restrictions). Use simple language.",
  "followUp": "Follow-up instruction if mentioned, or null"
}

Rules:
- Spell all medicine names correctly and completely
- "BD" or "twice" = "Twice daily" with meal_timing_slots: { breakfast: true, lunch: false, dinner: true }
- "TDS" or "thrice" or "three times" = "Three times daily" with meal_timing_slots: { breakfast: true, lunch: true, dinner: true }
- "OD" or "once daily" = "Once daily" with meal_timing_slots: { breakfast: true, lunch: false, dinner: false }
- "Once at night" or "At bedtime" with meal_timing_slots: { breakfast: false, lunch: false, dinner: true }
- "After food" or "after meal" = "After meals"
- "Before food" = "Before meals"
- "At night" or "before sleep" = "At bedtime"
- Extract every medicine mentioned, even if only partially described
- Write instructions in simple English a patient can understand

Dentist's voice note: ${voiceText}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;

  try {
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 1500 },
    }, {
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      timeout: 30000,
    });

    let text = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Gemini');
    text = text.replace(/^```json?\n?/i, '').replace(/```$/, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('[AI] Prescription extraction error:', err.message);
    return {
      medicines: [{ name: 'Amoxicillin', dose: '500 mg', frequency: 'Three times daily', duration: '5 days', timing: 'After meals', instructions: 'Complete the full course.', meal_timing_slots: { breakfast: true, lunch: true, dinner: true } }],
      instructions: 'Extraction failed — please add medicines manually.',
      followUp: null,
    };
  }
}

module.exports = { extractPrescription };
