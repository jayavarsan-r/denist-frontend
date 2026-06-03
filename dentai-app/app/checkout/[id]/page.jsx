import CheckoutClient from './CheckoutClient';

export function generateStaticParams() {
  const ids = ['q1', 'q2', 'q3', 'q4'];
  return ids.map((id) => ({ id }));
}

export default function CheckoutPage({ params }) {
  return <CheckoutClient entryId={params.id} />;
}
