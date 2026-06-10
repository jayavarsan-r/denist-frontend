import PatientProfileClient from './PatientProfileClient';

// output: export requires >=1 param. Real patient IDs are resolved
// client-side by the router at runtime in the Capacitor app.
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function PatientProfilePage({ params }) {
  const { id } = await params;
  return <PatientProfileClient patientId={id} />;
}
