import CheckoutClient from './CheckoutClient';

export function generateStaticParams() {
  return [];
}

export default async function CheckoutPage({ params }) {
  const { id } = await params;
  return <CheckoutClient entryId={id} />;
}
