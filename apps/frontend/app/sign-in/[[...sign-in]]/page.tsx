import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[#f7f3eb] px-4 py-8 text-[#0b1220]">
      <section className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[0.9fr_1.1fr] md:items-start">
        <div className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-[#eee7dc] md:p-8">
          <Link href="/" className="text-sm font-black text-[#ff5a00]">Bep Si F&B</Link>
          <h1 className="mt-5 text-[30px] font-black leading-tight tracking-tight md:text-5xl">Dang nhap</h1>
          <p className="mt-3 text-[15px] font-semibold leading-7 text-slate-600">
            Dung mot luong dang nhap duy nhat. Neu da co tai khoan Google, hay bam tiep tuc voi Google tai day.
          </p>
        </div>
        <div className="rounded-[32px] bg-white p-4 shadow-sm ring-1 ring-[#eee7dc] md:p-6">
          <div className="flex justify-center">
            <SignIn routing="path" path="/sign-in" />
          </div>
        </div>
      </section>
    </main>
  );
}
