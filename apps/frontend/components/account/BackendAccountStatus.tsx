"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AccountResponse = {
  mode?: "static";
  identityKind?: "static" | "customer" | "staff" | "unmapped";
  customerProfileRequired?: boolean;
  customerId?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  accountStatus?: "active" | "inactive" | "blocked";
  canViewWholesalePrice?: boolean;
  canPlaceOrder?: boolean;
  error?: string;
};

const statusContent = {
  pending: {
    label: "Pending",
    title: "Hồ sơ đang chờ duyệt",
    message: "Bạn chưa được xem giá sỉ và chưa thể đặt hàng. Admin sẽ duyệt hồ sơ trước khi mở quyền.",
    tone: "bg-amber-100 text-amber-800 ring-amber-200",
  },
  approved: {
    label: "Approved",
    title: "Đã mở quyền giá sỉ và đặt hàng",
    message: "Giá hiển thị và quyền checkout được backend xác nhận theo customer profile của bạn.",
    tone: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  },
  rejected: {
    label: "Rejected",
    title: "Hồ sơ chưa được chấp thuận",
    message: "Bạn chưa được xem giá sỉ hoặc đặt hàng. Hãy cập nhật hồ sơ và liên hệ Bếp Sỉ.",
    tone: "bg-rose-100 text-rose-800 ring-rose-200",
  },
} as const;

export function BackendAccountStatus() {
  const [data, setData] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as AccountResponse;
        if (!active) return;
        if (!response.ok) {
          setError(payload.error === "AUTH_REQUIRED" ? "Bạn cần đăng nhập để xem trạng thái hồ sơ." : "Không tải được trạng thái từ backend.");
          setData(null);
          return;
        }
        setData(payload);
      } catch {
        if (active) setError("Không kết nối được backend. Trang không dùng dữ liệu tĩnh thay thế.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <section className="rounded-[22px] bg-white p-5 font-black text-slate-500 ring-1 ring-[#efe7dc]">Đang tải trạng thái từ backend...</section>;
  if (error) return <section className="rounded-[22px] bg-red-50 p-5 font-black text-red-700 ring-1 ring-red-100">{error}</section>;
  if (!data) return null;

  if (data.mode === "static") {
    return (
      <section className="rounded-[22px] bg-white p-5 ring-1 ring-[#efe7dc]">
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 ring-1 ring-slate-200">Static mode</span>
        <h2 className="mt-3 text-2xl font-black">Catalog tĩnh không tạo order thật</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Deployment này không gọi backend customer, không hiển thị giá backend và không checkout.</p>
      </section>
    );
  }

  if (data.customerProfileRequired || data.identityKind === "unmapped") {
    return (
      <section className="rounded-[22px] bg-white p-5 ring-1 ring-[#efe7dc]">
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 ring-1 ring-slate-200">Chưa có hồ sơ</span>
        <h2 className="mt-3 text-2xl font-black">Tạo hồ sơ quán để được duyệt</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Backend chưa map Clerk user này với customer profile.</p>
        <Link href="/register" className="mt-4 inline-flex rounded-[16px] bg-[#0b1220] px-5 py-3 text-sm font-black text-white">Tạo hồ sơ</Link>
      </section>
    );
  }

  if (data.identityKind === "staff") {
    return <section className="rounded-[22px] bg-white p-5 font-black ring-1 ring-[#efe7dc]">Đây là tài khoản nhân viên, không phải customer account.</section>;
  }

  const status = data.approvalStatus || "pending";
  const content = statusContent[status];
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
      <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ring-1 ${content.tone}`}>{content.label}</span>
      <h2 className="mt-3 text-2xl font-black text-[#0b1220]">{content.title}</h2>
      <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{content.message}</p>
      <dl className="mt-4 grid gap-3 rounded-[18px] bg-[#fbfaf7] p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Trạng thái tài khoản</dt><dd className="font-black">{data.accountStatus || "—"}</dd></div>
        <div><dt className="text-slate-500">Xem giá sỉ</dt><dd className="font-black">{data.canViewWholesalePrice ? "Có" : "Không"}</dd></div>
        <div><dt className="text-slate-500">Đặt hàng</dt><dd className="font-black">{data.canPlaceOrder ? "Có" : "Không"}</dd></div>
        <div><dt className="text-slate-500">Customer ID</dt><dd className="break-all font-mono text-xs">{data.customerId || "—"}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/register" className="rounded-[16px] bg-[#fff3ea] px-4 py-3 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Cập nhật hồ sơ</Link>
        <Link href="/orders" className="rounded-[16px] bg-[#0b1220] px-4 py-3 text-sm font-black text-white">Đơn hàng của tôi</Link>
      </div>
    </section>
  );
}
