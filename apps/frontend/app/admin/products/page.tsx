import { AdminProductsAuditPanelV2 } from "@/components/admin/AdminProductsAuditPanelV2";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminProductsPage() {
  return (
    <AdminShell
      title="Sản phẩm"
      subtitle="Rà dữ liệu catalog, đặt giá và bật bán bằng cùng dialog, form control và trạng thái với các module admin khác."
    >
      <AdminProductsAuditPanelV2 />
    </AdminShell>
  );
}
