import PatientProfileClient from './PatientProfileClient';

// generateStaticParams returns [] — patient IDs come from the API at runtime.
// For Capacitor production builds (NEXT_EXPORT=1), use the real patient list.
export function generateStaticParams() {
  return [];
}

export default async function PatientProfilePage({ params }) {
  const { id } = await params;
  return <PatientProfileClient patientId={id} />;
}
