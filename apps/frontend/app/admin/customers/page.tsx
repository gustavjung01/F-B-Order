import { AdminCustomersPanel } from "@/components/admin/AdminCustomersPanel";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminCustomersPage() {
  return (
    <AdminShell title="Duyệt hồ sơ quán" subtitle="Khách được duyệt mới xem giá sỉ, công thức chi tiết và gửi đơn.">
      <AdminCustomersPanel />
    </AdminShell>
  );
}
