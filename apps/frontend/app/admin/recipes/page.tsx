import { AdminRecipesPanel } from "@/components/admin/AdminRecipesPanel";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminRecipesPage() {
  return (
    <AdminShell title="Công thức" subtitle="Tạo và quản lý công thức nháp trước khi đưa vào quy trình duyệt/xuất bản.">
      <AdminRecipesPanel />
    </AdminShell>
  );
}
