import { AdminProductsAuditPanel } from "@/components/admin/AdminProductsAuditPanel";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminProductsPage() {
  return (
    <AdminShell
      title="Quản lý sản phẩm"
      subtitle="Điền dữ liệu vận hành, đặt giá, bật bán và lấy Product ID cho production smoke test."
    >
      <AdminProductsAuditPanel />
    </AdminShell>
  );
}
