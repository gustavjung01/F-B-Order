"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { useState } from "react";
import { AdminCustomersPanel } from "@/components/admin/AdminCustomersPanel";
import { AdminOrdersPanel } from "@/components/admin/AdminOrdersPanel";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function AdminOperationsDashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const [tab, setTab] = useState<"customers" | "orders">("customers");

  if (!isLoaded)
    return <main className="min-h-screen p-8">Đang tải phiên đăng nhập…</main>;
  if (!isSignedIn)
    return (
      <main className="min-h-screen p-8">
        Bạn cần đăng nhập để mở khu vực quản trị.
      </main>
    );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm md:px-8">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Bếp Sỉ
            </p>
            <h1 className="text-2xl font-bold">Admin vận hành</h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <a
              className="text-sm font-medium text-slate-600 hover:text-slate-950"
              href="/"
            >
              Về trang bán hàng
            </a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === "customers" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
            onClick={() => setTab("customers")}
          >
            Customers
          </button>
          <button
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === "orders" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
            onClick={() => setTab("orders")}
          >
            Orders
          </button>
        </div>

        {tab === "customers" ? <AdminCustomersPanel /> : <AdminOrdersPanel />}
      </div>
    </main>
  );
}
