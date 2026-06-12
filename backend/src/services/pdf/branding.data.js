// backend/src/services/pdf/branding.data.js
// Loads the { clinic, dentist } branding block for the requesting user. One query path
// reused by every PDF route so headers are identical and we never duplicate the fetch.
const supabase = require('../../config/supabase');
const { getSignedUrl } = require('../storage.service');

// clinics.logo_url stores the storage PATH (e.g. "<clinicId>/logo.png"), not a URL, so
// it never expires. Sign it fresh here (cheap, used immediately by the renderer). If it's
// already an http(s) URL (e.g. a public bucket), leave it. Failures degrade to no logo.
async function resolveLogo(clinic) {
  const v = clinic && clinic.logo_url;
  if (!v || /^https?:\/\//i.test(v)) return clinic;
  try { return { ...clinic, logo_url: await getSignedUrl('clinic-logos', v, 3600) }; }
  catch { return { ...clinic, logo_url: null }; }
}

async function loadBrandingContext(req) {
  let clinic = {};
  let dentist = {};
  if (req.staffId) {
    const { data: staff } = await supabase
      .from('staff')
      .select('name, registration_number, clinics(name, address, phone, registration_number, logo_url)')
      .eq('id', req.staffId)
      .single();
    if (staff) {
      dentist = { name: staff.name, registration_number: staff.registration_number };
      if (staff.clinics) clinic = staff.clinics;
    }
  }
  if ((!clinic || !clinic.name) && req.clinicId) {
    const { data: c } = await supabase
      .from('clinics')
      .select('name, address, phone, registration_number, logo_url')
      .eq('id', req.clinicId)
      .single();
    if (c) clinic = c;
  }
  clinic = await resolveLogo(clinic || {});
  return { clinic: clinic || {}, dentist: dentist || {} };
}

module.exports = { loadBrandingContext };
