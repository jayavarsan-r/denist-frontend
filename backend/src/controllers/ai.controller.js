const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const storageService = require('../services/storage.service');

// Ensure upload directory exists
const UPLOAD_DIR = '/tmp/dental-uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});
exports.uploadMiddleware = upload.single('audio');

exports.transcribe = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file received. Make sure field name is "audio".' });
    }

    const recordingType = req.body?.recordingType || 'general';

    const noKey = !process.env.SARVAM_API_KEY || process.env.SARVAM_API_KEY === 'your_sarvam_api_key_here';
    if (noKey) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.json({
        transcript: 'Root canal completed on tooth 26. Temporary crown placed. Patient tolerated procedure well. Follow up in 7 days.'
      });
    }

    // Sarvam accepts: wav, mp3, ogg, flac, m4a — NOT webm
    // Detect format from original filename (set by frontend) and MIME type
    const origName = req.file.originalname || '';
    const mimeType = req.file.mimetype || 'audio/ogg';

    // Sarvam accepts: wav, mp3, ogg, flac, m4a — NOT webm
    // Chrome records webm/opus → we label it as ogg/opus (same codec, Sarvam accepts the container)
    let ext = 'ogg'; // safe default
    if (origName.endsWith('.m4a') || origName.endsWith('.mp4') || mimeType.includes('mp4') || mimeType.includes('mpeg')) ext = 'm4a';
    else if (origName.endsWith('.wav') || mimeType.includes('wav')) ext = 'wav';
    else if (origName.endsWith('.mp3') || mimeType.includes('mp3')) ext = 'mp3';
    else if (origName.endsWith('.flac') || mimeType.includes('flac')) ext = 'flac';
    // webm and ogg both use Opus codec → tell Sarvam it's ogg
    // ogg stays ogg

    const filename = `recording.${ext}`;
    const contentType = ext === 'm4a' ? 'audio/mp4' : ext === 'wav' ? 'audio/wav' : `audio/${ext}`;
    console.log(`[Sarvam] Sending: filename=${filename} contentType=${contentType} origMime=${mimeType} size=${req.file.size}b`);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), { filename, contentType });
    formData.append('model', 'saarika:v2.5');
    formData.append('language_code', 'en-IN');   // en-IN handles Tamil + English mixing reliably
    formData.append('with_timestamps', 'false');

    const response = await axios.post('https://api.sarvam.ai/speech-to-text', formData, {
      headers: {
        ...formData.getHeaders(),
        'api-subscription-key': process.env.SARVAM_API_KEY,
      },
      timeout: 30000,
    });

    // Upload audio to Supabase Storage for dataset collection (non-fatal)
    let audioStoragePath = null;
    let audioFileSizeKb = null;
    try {
      const tempId = `tmp_${Date.now()}`;
      const uploaded = await storageService.uploadFile(
        req.file.path, 'voice-notes',
        `${recordingType}/${req.dentistId}/${tempId}`
      );
      audioStoragePath = uploaded.storagePath;
      audioFileSizeKb = uploaded.sizeKb;
    } catch (uploadErr) {
      console.error('[AI] Audio upload failed (non-fatal):', uploadErr.message);
    }

    // Save to voice_recordings dataset table (non-fatal)
    if (audioStoragePath) {
      try {
        const supabase = require('../config/supabase');
        await supabase.from('voice_recordings').insert({
          dentist_id:     req.dentistId,
          recording_type: recordingType,
          transcript:     response.data.transcript || '',
          audio_path:     audioStoragePath,
          audio_size_kb:  audioFileSizeKb,
        });
      } catch (datasetErr) {
        console.error('[AI] voice_recordings insert failed (non-fatal):', datasetErr.message);
      }
    }

    try { fs.unlinkSync(req.file.path); } catch {}
    res.json({ transcript: response.data.transcript, audioStoragePath, audioFileSizeKb });
  } catch (e) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
    const sarvamBody = e.response?.data;
    const sarvamErr = sarvamBody?.error?.message || sarvamBody?.message || sarvamBody?.detail || e.message;
    console.error('[Sarvam] HTTP', e.response?.status, '| body:', JSON.stringify(sarvamBody));
    res.json({
      transcript: '',
      warning: `Sarvam error (${e.response?.status || 'network'}): ${sarvamErr}`,
    });
  }
};

function buildPrompt() {
  const today = new Date().toISOString().split('T')[0];
  return `You are a dental clinical AI assistant. Today's date is ${today}.
Extract structured information from a dentist's voice note and return ONLY valid JSON with this exact schema:
{
  "procedure": "string (e.g. Root Canal, Scaling, Crown Placement)",
  "toothNumber": "string or null (FDI tooth number mentioned, e.g. '26', '14', '21'. Convert from Universal to FDI if needed. Upper right: 11-18, upper left: 21-28, lower left: 31-38, lower right: 41-48. If multiple teeth mentioned, use the primary tooth.)",
  "status": "completed|in_progress|pending",
  "notes": "string (clinical observations and what was done)",
  "medications": "string or null",
  "nextSteps": "string or null",
  "followUpDays": "number or null (how many days until follow-up)",
  "followUpDate": "YYYY-MM-DD or null (calculate from today ${today} using followUpDays if mentioned, use the correct year ${new Date().getFullYear()})",
  "cost": "number or null (extract any monetary amount mentioned, e.g. if 'charged 2500 rupees' or 'cost is 1500' then 2500 or 1500. Return as plain number without currency symbol.)",
  "currency": "string (currency code, default 'INR'. Use 'USD' if dollars mentioned, 'INR' if rupees/Rs mentioned.)",
  "totalSittings": "number or null — total sittings required if dentist mentions it (e.g. '4 sittings required' means 4)",
  "remainingSittings": "number or null — remaining sittings after today",
  "isMultiSitting": "boolean — true if procedure requires multiple visits or dentist mentions sittings",
  "treatmentPlanSuggested": "boolean — true if the note suggests creating a treatment plan",
  "assignedDoctor": "string or null — name of doctor assigned to this procedure if mentioned (e.g. 'This will be handled by Dr Priya' → 'Dr Priya', 'Refer to Dr Rajkumar' → 'Dr Rajkumar'). null if not mentioned."
}
If a follow-up is mentioned (e.g. 'follow up in 7 days', 'next appointment in 2 weeks'), calculate the exact date from today ${today}.
For FDI tooth numbers: if the dentist says 'tooth 6' or 'upper right 6', map to FDI '16'. If 'lower left molar' or 'tooth 36', use '36'. Always output standard FDI two-digit numbers.
Return ONLY the JSON object, no markdown, no explanation, no code blocks.`;
}

exports.generateNote = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript required' });

    const geminiKey = process.env.GEMINI_API_KEY;
    const noKey = !geminiKey || geminiKey.startsWith('your_');

    if (noKey) {
      return res.json({ structured: mockNote(transcript) });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;
    const response = await axios.post(url, {
      system_instruction: { parts: [{ text: buildPrompt() }] },
      contents: [{ parts: [{ text: transcript }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    }, {
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      timeout: 30000,
    });

    let text = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Gemini');

    // Strip markdown code fences if present
    text = text.replace(/^```json?\n?/i, '').replace(/```$/,'').trim();

    const structured = JSON.parse(text);
    res.json({ structured });
  } catch (e) {
    console.error('Gemini error:', e.response?.data || e.message);
    res.json({ structured: mockNote(req.body?.transcript) });
  }
};

exports.extractComplaint = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey || geminiKey.startsWith('your_')) {
      // Fallback: return transcript as-is
      return res.json({ complaint: transcript });
    }

    const prompt = `You are a receptionist assistant at an Indian dental clinic. The receptionist has recorded the patient's chief complaint by voice — it may be in Tamil, English, or a mix (Tanglish).

Your job: extract and translate the patient's main dental complaint into ONE clear English sentence (max 15 words). Focus on: location of pain/problem, symptom, and duration if mentioned.

Examples:
- Input (Tamil): "avangalukku left side jaw-la intense pain irukku romba naal aagudhu" → Output: "Intense pain on the left side jaw for several days"
- Input (mixed): "tooth 26 area-la swelling and bleeding gums irukku" → Output: "Swelling and bleeding gums near tooth 26"
- Input (English): "patient says upper right tooth pain since yesterday" → Output: "Upper right tooth pain since yesterday"

Return ONLY the clean English complaint sentence. No quotes, no explanation.

Receptionist's recording: ${transcript}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 64 },
    }, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, timeout: 15000 });

    const text = (response.data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    res.json({ complaint: text || transcript });
  } catch (e) {
    console.error('extractComplaint error:', e.message);
    res.json({ complaint: req.body?.transcript || '' });
  }
};

exports.extractPatient = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey || geminiKey.startsWith('your_')) {
      return res.json({ patient: { name: null, age: null, gender: null, bloodGroup: null, conditions: [], allergies: [], medications: [] } });
    }

    const prompt = `You are a medical receptionist assistant at an Indian dental clinic. The receptionist has recorded patient details by voice — it may be in Tamil, English, or Tanglish.

Extract the following fields and return ONLY valid JSON:
{
  "name": "string or null — patient's full name if mentioned. Look for 'patient name is X', 'her name is X', 'his name is X', 'name X'. Return full name as stated.",
  "age": number or null,
  "gender": "Male" | "Female" | "Other" | null,
  "bloodGroup": "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-" | null,
  "conditions": ["Diabetes", "Hypertension", "Heart condition", "Pregnant", "Blood thinners"] — only include conditions that are clearly mentioned,
  "allergies": ["Penicillin", "Latex", ...] — list of allergies mentioned,
  "medications": ["Metformin", ...] — current medications mentioned
}

Rules:
- "sugar" or "sugar patient" or "diabetic" = Diabetes in conditions
- "BP" or "pressure" or "BP patient" = Hypertension in conditions
- "heart patient" or "cardiac" = Heart condition in conditions
- "pregnant" or "pregnancy" = Pregnant in conditions
- "blood thinner" or "warfarin" or "aspirin" = Blood thinners in conditions
- Return empty arrays if nothing mentioned, never null arrays
- Return ONLY the JSON object

Recording: ${transcript}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    }, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, timeout: 15000 });

    let text = (response.data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    text = text.replace(/^```json?\n?/i, '').replace(/```$/, '').trim();
    const patient = JSON.parse(text);
    res.json({ patient });
  } catch (e) {
    console.error('extractPatient error:', e.message);
    res.json({ patient: { name: null, age: null, gender: null, bloodGroup: null, conditions: [], allergies: [], medications: [] } });
  }
};

exports.extractPatientInfo = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey || geminiKey.startsWith('your_')) {
      return res.json({ name: '', age: null, phone: '', complaint: transcript, flags: {} });
    }

    const prompt = `You are a patient registration assistant at an Indian dental clinic. A receptionist or doctor has spoken patient details by voice. The speech may be in ANY language — Tamil, Hindi, Telugu, Malayalam, Kannada, English, or any mix/transliteration of these.

Your job: extract structured patient info from the transcript and return ONLY valid JSON.

Return ONLY this JSON, no markdown, no extra text:
{
  "name": "Patient full name, properly capitalized. Null if not mentioned.",
  "age": "Age as integer. Null if not mentioned.",
  "phone": "10-digit mobile number, digits only, no spaces or dashes. Null if not mentioned.",
  "chiefComplaint": "Chief complaint translated to clear English, max 20 words. Null if not mentioned.",
  "bloodGroup": "One of: A+ A- B+ B- O+ O- AB+ AB- — or null if not mentioned.",
  "flags": {
    "hasDiabetes": false,
    "hasHypertension": false,
    "hasHeartCondition": false,
    "isPregnant": false,
    "isOnBloodThinners": false,
    "penicillin": false,
    "latex": false
  }
}

Extraction rules:
- Name: any language name spoken — capitalize each word (e.g. "ravi kumar" → "Ravi Kumar")
- Age: spoken as "28 years", "28 வயது", "28 saal" — extract the number
- Phone: any 10 consecutive digits spoken (ignore country code +91)
- Complaint: translate to English if spoken in any other language
  • "பல் வலி" or "dant dard" or "tooth pain" → "Tooth pain"
  • "வாய் புண்" → "Mouth ulcer"
  • "ஈறு வலி" → "Gum pain"
  • "jaw pain", "sensitivity", "bleeding gums" etc → keep in English
- Blood group: "B positive", "B posi", "B+", "பி பாசிட்டிவ்" → "B+"
- Medical flags:
  • "sugar", "diabetic", "நீரிழிவு" → hasDiabetes: true
  • "BP", "pressure", "blood pressure" → hasHypertension: true
  • "heart problem", "cardiac", "heart patient" → hasHeartCondition: true
  • "pregnant", "கர்ப்பிணி" → isPregnant: true
  • "blood thinner", "warfarin", "aspirin daily" → isOnBloodThinners: true
- If a field is not mentioned, return null (for strings/numbers) or false (for booleans)

Transcript: ${transcript}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, timeout: 20000 });

    let text = (response.data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    text = text.replace(/^```json?\n?/i, '').replace(/```$/, '').trim();
    const result = JSON.parse(text);
    res.json(result);
  } catch (e) {
    console.error('extractPatientInfo error:', e.response?.data || e.message);
    res.json({ name: null, age: null, phone: null, complaint: null, flags: {}, warning: 'Could not extract — please fill manually' });
  }
};

exports.extractPrescription = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey || geminiKey.startsWith('your_')) {
      return res.json({
        medicines: [
          { name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', duration: '5 days', notes: 'After food' },
          { name: 'Ibuprofen',   dosage: '400mg', frequency: 'BD',  duration: '3 days', notes: 'After food' },
        ],
        instructions: 'Avoid hard food. Warm salt water rinse twice daily.',
        followUpDays: 7,
      });
    }

    const prompt = `You are a dental clinical AI assistant. Extract a prescription from the dentist's voice note.
Return ONLY valid JSON with this exact schema — no markdown, no explanation:
{
  "medicines": [
    {
      "name": "string (medicine name only, no dose here)",
      "dosage": "string (e.g. '500mg', '1 tab')",
      "frequency": "OD|BD|TDS|QID|SOS|HS (choose the closest match)",
      "duration": "string (e.g. '5 days', '1 week')",
      "notes": "string or null (e.g. 'after food', 'before bed')",
      "uncertain": boolean (true if you're not confident about this medicine)
    }
  ],
  "instructions": "string or null (general patient instructions beyond individual medicines)",
  "followUpDays": number or null
}

Rules:
- If the doctor says 'Amoxicillin 500mg three times a day for 5 days after food', extract: name=Amoxicillin, dosage=500mg, frequency=TDS, duration=5 days, notes=after food
- Common Indian dental medicines: Amoxicillin, Metronidazole (Flagyl), Ibuprofen, Diclofenac, Paracetamol, Clindamycin, Chlorhexidine mouthwash, Pantoprazole, Aceclofenac
- 'once daily'=OD, 'twice daily'=BD, 'thrice daily'=TDS, 'four times'=QID, 'at night'=HS, 'as needed'=SOS
- Return empty array for medicines if none found
- Be generous with uncertain=true when you're guessing

Voice note: ${transcript}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    }, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, timeout: 20000 });

    let text = (response.data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    text = text.replace(/^```json?\n?/i, '').replace(/```$/, '').trim();
    const result = JSON.parse(text);
    res.json(result);
  } catch (e) {
    console.error('extractPrescription error:', e.response?.data || e.message);
    res.json({ medicines: [], instructions: null, followUpDays: null, warning: 'Could not extract — please fill manually' });
  }
};

function mockNote(transcript) {
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
}
