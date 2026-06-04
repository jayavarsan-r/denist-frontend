-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS public.voice_recordings (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dentist_id     uuid REFERENCES public.dentists(id) ON DELETE CASCADE,
  patient_id     uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  recording_type text NOT NULL DEFAULT 'general', -- 'new_patient' | 'diagnosis' | 'general'
  transcript     text,
  audio_path     text,
  audio_size_kb  numeric(10,2),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_recordings_dentist_idx ON public.voice_recordings (dentist_id);
CREATE INDEX IF NOT EXISTS voice_recordings_type_idx    ON public.voice_recordings (dentist_id, recording_type);
