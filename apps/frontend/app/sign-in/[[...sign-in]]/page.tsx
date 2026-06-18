import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10">
      {hasClerkKey ? (
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" afterSignInUrl="/" />
      ) : (
        <div className="max-w-md rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-bold text-slate-950">Chưa cấu hình Clerk</h1>
          <p className="mt-3 text-slate-600">Thêm NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY để bật đăng nhập.</p>
        </div>
      )}
    </main>
  );
}
