import Link from "next/link";
import { SignedIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { ClerkAccountPanel } from "@/components/auth/ClerkAccountPanel";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import { db, type CustomerProfile } from "@/lib/db";
import { getApprovalLabel, getApprovalTone, type ApprovalStatus } from "@/lib/mockCustomer";

export const dynamic = "force-dynamic";

function toStatus(status?: string): ApprovalStatus {
  if (status === "approved" || status === "pending" || status === "rejected") return status;
  return "guest";
}

async function getProfile(userId?: string | null) {
  if (!userId) return null;
  const result = await db.query<CustomerProfile>(`SELECT * FROM customers WHERE clerk_user_id = $1 LIMIT 1`, [userId]);
  return result.rows[0] || null;
}

export default async function AccountPage() {
  const { userId } = await auth();
  const profile = await getProfile(userId);
  const status = toStatus(profile?.approval_status);
  const approved = status === "approved";
  const hasProfile = Boolean(profile);

  const shopFields = [
    { label: "Shop / quán", value: profile?.shop_name || "Chưa tạo hồ sơ" },
    { label: "Liên hệ", value: profile?.contact_name || "Chưa có" },
    { label: "Điện thoại", value: profile?.phone || "Chưa có" },
    { label: "Địa chỉ", value: profile?.address || "Chưa có" },
    { label: "MST", value: profile?.tax_code || "Không bắt buộc" },
    { label: "Ngành", value: profile?.business_type || "Chưa có" },
  ];

  return (
    <ResponsivePageShell active="account" title="Tài khoản" subtitle="Quản lý đăng nhập và hồ sơ">
      <div className="space-y-3 md:space-y-4">
        <ClerkAccountPanel />

        <SignedIn>
          <section className="rounded-[22px] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`inline-flex rounded-full px-3 py-1.5 text-[12px] font-black ring-1 ${getApprovalTone(status)}`}>
                  {getApprovalLabel(status)}
                </span>
                <h1 className="mt-3 text-[22px] font-black leading-tight text-[#0b1220] md:text-3xl">
                  {approved ? "Đã mở khóa giá sỉ" : hasProfile ? "Hồ sơ quán đang chờ duyệt" : "Chưa tạo hồ sơ quán"}
                </h1>
                <p className="mt-2 text-[13px] font-bold leading-5 text-slate-600 md:text-sm">
                  {hasProfile ? "Giá sỉ, công thức chi tiết và đặt hàng chỉ mở sau khi admin duyệt hồ sơ quán." : "Tạo hồ sơ quán để admin duyệt và mở khóa giá sỉ."}
                </p>
              </div>
              <Link href="/register" className="shrink-0 rounded-[16px] bg-[#fff3ea] px-3 py-2 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">
                {hasProfile ? "Cập nhật" : "Tạo hồ sơ"}
              </Link>
            </div>
          </section>

          <section className="rounded-[22px] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-black text-[#0b1220]">Hồ sơ shop</h2>
              <Link href="/register" className="text-[13px] font-black text-[#ff5a00]">Sửa</Link>
            </div>
            <div className="mt-3 divide-y divide-[#eee7dc] rounded-[18px] border border-[#eee7dc] bg-[#fbfaf7]">
              {shopFields.map((field) => (
                <div key={field.label} className="grid grid-cols-[108px_1fr] gap-3 px-4 py-3 md:grid-cols-[150px_1fr]">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{field.label}</p>
                  <p className="text-right text-[14px] font-black text-[#0b1220] md:text-left md:text-[15px]">{field.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[22px] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Đơn hàng</p>
                <h2 className="mt-1 text-[20px] font-black text-[#0b1220]">Lịch sử đơn đã gửi</h2>
                <p className="mt-1 text-[13px] font-bold leading-5 text-slate-600">Xem mã đơn, trạng thái và chi tiết sản phẩm đã đặt.</p>
              </div>
              <Link href="/orders" className="shrink-0 rounded-[16px] bg-[#0b1220] px-4 py-3 text-[13px] font-black text-white">
                Xem đơn
              </Link>
            </div>
          </section>

          <section className="rounded-[22px] bg-[#0b1220] p-4 text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-200">Nhân viên phụ trách</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-black">{profile?.sales_owner || "Bếp Sỉ F&B"}</h2>
                <p className="mt-1 text-[13px] font-bold leading-5 text-slate-300">
                  {approved ? "Có thể gửi đơn để sales xác nhận." : hasProfile ? "Sales sẽ xác minh trước khi mở giá." : "Tạo hồ sơ để sales nắm thông tin quán."}
                </p>
              </div>
              <Link href="/" className="shrink-0 rounded-[16px] bg-white px-4 py-3 text-[13px] font-black text-[#0b1220]">
                Xem hàng
              </Link>
            </div>
          </section>
        </SignedIn>
      </div>
    </ResponsivePageShell>
  );
}
