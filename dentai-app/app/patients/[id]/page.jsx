import { patients } from '@/lib/data/patients';
import PatientProfileClient from './PatientProfileClient';

export function generateStaticParams() {
  return patients.map((p) => ({ id: p.id }));
}

export default function PatientProfilePage({ params }) {
  return <PatientProfileClient patientId={params.id} />;
}
