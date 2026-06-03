import { visits } from '@/lib/data/visits';
import AppointmentClient from './AppointmentClient';

export function generateStaticParams() {
  const ids = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9'];
  return ids.map((id) => ({ id }));
}

export default function AppointmentPage({ params }) {
  return <AppointmentClient visitId={params.id} />;
}
