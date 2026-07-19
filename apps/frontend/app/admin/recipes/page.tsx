import { AdminRecipeOperationsPanelV5 } from "@/components/admin/AdminRecipeOperationsPanelV5";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminRecipesPage() {
  return (
    <AdminShell
      title="Công thức"
      subtitle="Biên tập theo tab, quản lý media R2 và vận hành quy trình duyệt/xuất bản. Scope tính năng đã khóa; đợt này chỉ chuẩn hóa giao diện."
    >
      <AdminRecipeOperationsPanelV5 />
    </AdminShell>
  );
}
