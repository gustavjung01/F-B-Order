import { AdminRecipeScalePanel } from "@/components/admin/AdminRecipeScalePanel";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminRecipeScalePage() {
  return (
    <AdminShell title="Scale công thức" subtitle="Quy đổi lượng nguyên liệu bằng engine backend, không thay đổi công thức gốc.">
      <AdminRecipeScalePanel />
    </AdminShell>
  );
}
