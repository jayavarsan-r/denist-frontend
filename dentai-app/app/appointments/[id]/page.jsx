import AppointmentClient from './AppointmentClient';

export function generateStaticParams() {
  // output: export requires >=1 param. Real visit IDs are resolved
  // client-side by the router at runtime in the Capacitor app.
  return [{ id: 'placeholder' }];
}

export default async function AppointmentPage({ params }) {
  const { id } = await params;
  return <AppointmentClient visitId={id} />;
}
