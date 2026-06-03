import AppointmentClient from './AppointmentClient';

export function generateStaticParams() {
  return [];
}

export default async function AppointmentPage({ params }) {
  const { id } = await params;
  return <AppointmentClient visitId={id} />;
}
