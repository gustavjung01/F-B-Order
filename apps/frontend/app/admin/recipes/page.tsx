import { AdminRecipeOperationsPanel } from "@/components/admin/AdminRecipeOperationsPanel";
import { AdminShell } from "@/components/admin/AdminShell";
import "./recipe-operations.css";

export const dynamic = "force-dynamic";

export default function AdminRecipesPage() {
  return (
    <AdminShell title="Công thức" subtitle="Tạo, chọn ảnh, đặt đơn vị và quản lý quy trình duyệt/xuất bản công thức.">
      <div className="recipe-operations-page">
        <AdminRecipeOperationsPanel />
      </div>
    </AdminShell>
  );
}
