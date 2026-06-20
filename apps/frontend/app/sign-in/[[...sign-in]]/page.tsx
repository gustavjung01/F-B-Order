import Link from "next/link";

const hostedSignInUrl = "https://accounts.bepsi.click/sign-in";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[#f7f3eb] px-4 py-8 text-[#0b1220]">
      <section className="mx-auto max-w-2xl rounded-[32px] bg-white p-6 text-center shadow-sm ring-1 ring-[#eee7dc] md:p-8">
        <Link href="/" className="text-sm font-black text-[#ff5a00]">Bep Si F&B</Link>
        <h1 className="mt-5 text-[30px] font-black leading-tight tracking-tight md:text-5xl">Dang nhap</h1>
        <p className="mt-3 text-[15px] font-semibold leading-7 text-slate-600">
          Su dung trang dang nhap chinh thuc cua Clerk de tranh loi widget nhung trong app.
        </p>
        <a href={hostedSignInUrl} className="mt-6 inline-flex rounded-[18px] bg-[#0b1220] px-6 py-3 text-sm font-black text-white shadow-sm">
          Mo trang dang nhap
        </a>
      </section>
    </main>
  );
}
