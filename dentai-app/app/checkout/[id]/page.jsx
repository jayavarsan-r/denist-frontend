import CheckoutClient from './CheckoutClient';

export function generateStaticParams() {
  // output: export requires >=1 param. Real entry IDs are resolved
  // client-side by the router at runtime in the Capacitor app.
  return [{ id: 'placeholder' }];
}

export default async function CheckoutPage({ params }) {
  const { id } = await params;
  return <CheckoutClient entryId={id} />;
}
