import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bếp Sỉ Admin",
  description: "Khu quản trị đơn hàng và khách sỉ Bếp Sỉ F&B.",
  manifest: "/admin-manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ],
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await requireAdmin();

  if (!isAdmin) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-5 text-white">
        <section className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-orange-500/15 text-[34px]">🔒</div>
          <p className="mt-5 text-[12px] font-black uppercase tracking-[0.16em] text-orange-200">Admin only</p>
          <h1 className="mt-3 text-[28px] font-black leading-tight">Khu quản trị bị khóa</h1>
          <p className="mt-3 text-[14px] font-bold leading-6 text-slate-300">Chỉ email nằm trong ADMIN_EMAILS mới mở được PWA admin. Khu này tách khỏi PWA khách và không hiện nút ngoài public.</p>
          <Link href="/" className="mt-5 flex h-12 items-center justify-center rounded-[18px] bg-white px-5 text-[15px] font-black text-slate-950">
            Quay về app khách
          </Link>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
