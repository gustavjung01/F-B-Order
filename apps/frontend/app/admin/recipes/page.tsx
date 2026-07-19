import { AdminRecipeOperationsPanelV5 } from "@/components/admin/AdminRecipeOperationsPanelV5";
import { AdminShell } from "@/components/admin/AdminShell";
import "./recipe-operations.css";

export const dynamic = "force-dynamic";

export default function AdminRecipesPage() {
  return (
    <AdminShell title="Công thức" subtitle="Biên tập theo tab, sắp xếp trực quan và quản lý quy trình duyệt/xuất bản công thức.">
      <div className="recipe-operations-page">
        <AdminRecipeOperationsPanelV5 />
      </div>
    </AdminShell>
  );
}
