function maskKey(value?: string) {
  if (!value) return "MISSING";
  if (value.length <= 18) return value;
  return `${value.slice(0, 16)}...${value.slice(-10)}`;
}

function keyMode(value?: string) {
  if (!value) return "missing";
  if (value.startsWith("pk_live_")) return "production/live";
  if (value.startsWith("pk_test_")) return "development/test";
  return "unknown";
}

export const dynamic = "force-dynamic";

export default function ClerkDebugPage() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasSecretKey = Boolean(process.env.CLERK_SECRET_KEY);

  return (
    <main className="min-h-screen bg-[#f7f3eb] px-4 py-8 text-[#0b1220]">
      <section className="mx-auto max-w-2xl rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-[#eee7dc]">
        <h1 className="text-2xl font-black">Clerk env check</h1>
        <div className="mt-5 space-y-3 text-sm font-bold">
          <p>Publishable key mode: {keyMode(publishableKey)}</p>
          <p>Publishable key: {maskKey(publishableKey)}</p>
          <p>Secret key configured: {hasSecretKey ? "yes" : "no"}</p>
        </div>
        <p className="mt-5 text-sm font-semibold leading-6 text-slate-600">
          Compare this publishable key with the Clerk Dashboard API keys for the same application and environment that contains the user account.
        </p>
      </section>
    </main>
  );
}
