import { AdminProductsPanel } from "@/components/admin/AdminProductsPanel";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminProductsPage() {
  return (
    <AdminShell title="Quản lý sản phẩm" subtitle="Lọc sản phẩm thiếu quy cách, đơn vị, giá và ảnh.">
      <AdminProductsPanel />
    </AdminShell>
  );
}
