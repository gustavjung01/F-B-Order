import { SignUp } from "@clerk/nextjs";

export default function RegisterPage() {
  const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10">
      {hasClerkKey ? (
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
      ) : (
        <div className="max-w-md rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-bold text-slate-950">Clerk not configured</h1>
          <p className="mt-3 text-slate-600">Add Clerk publishable key to enable account creation.</p>
        </div>
      )}
    </main>
  );
}
