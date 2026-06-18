import { AdminOrdersPanel } from "@/components/admin/AdminOrdersPanel";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminOrdersPage() {
  return (
    <AdminShell title="Quản lý đơn hàng" subtitle="Xem đơn mới, kiểm tra sản phẩm và cập nhật trạng thái xử lý cho sales.">
      <AdminOrdersPanel />
    </AdminShell>
  );
}
