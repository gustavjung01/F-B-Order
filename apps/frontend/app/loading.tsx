export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f7f3eb] px-4 py-6 text-[#0b1220] md:px-8 md:py-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-[28px] bg-white/85 px-4 py-3 shadow-sm ring-1 ring-[#eee7dc]">
        <div className="h-12 w-36 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-10 w-24 animate-pulse rounded-[18px] bg-slate-200" />
      </div>

      <section className="mx-auto mt-5 grid max-w-6xl gap-5 md:mt-8 md:grid-cols-[0.92fr_1.08fr] md:items-start">
        <div className="rounded-[32px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-8">
          <div className="h-6 w-36 animate-pulse rounded-full bg-[#f3e7db]" />
          <div className="mt-4 h-12 w-4/5 animate-pulse rounded-2xl bg-slate-100" />
          <div className="mt-3 h-5 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="mt-2 h-5 w-5/6 animate-pulse rounded-full bg-slate-100" />
        </div>

        <div className="rounded-[32px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-6">
          <div className="h-[540px] animate-pulse rounded-[24px] bg-slate-100" />
        </div>
      </section>
    </main>
  );
}
