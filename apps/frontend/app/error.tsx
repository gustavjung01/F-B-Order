"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f3eb] px-4 text-[#0b1220]">
      <section className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.12)] ring-1 ring-[#efe7dc] md:p-8">
        <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#ff5a00]">Bếp Sỉ F&B</p>
        <h1 className="mt-3 text-[28px] font-black leading-tight md:text-[34px]">Trang này gặp lỗi khi tải</h1>
        <p className="mt-3 text-[15px] font-semibold leading-7 text-slate-600">
          Màn hình sẽ không bị treo im lặng nữa. Bạn có thể thử tải lại trang hoặc quay lại sau.
        </p>
        <pre className="mt-4 overflow-auto rounded-[20px] bg-slate-950 p-4 text-[12px] leading-6 text-slate-100">{error.message}</pre>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="h-11 rounded-[18px] bg-[#ff5a00] px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(255,90,0,0.18)]"
          >
            Thử lại
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center rounded-[18px] bg-slate-100 px-5 text-sm font-black text-slate-900"
          >
            Về trang chủ
          </a>
        </div>
      </section>
    </main>
  );
}
