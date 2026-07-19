import { AdminOperationsDashboard } from "@/components/admin/AdminOperationsDashboard";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <AdminShell
      title="Vận hành"
      subtitle="Duyệt khách hàng và xử lý đơn hàng trong cùng một hệ giao diện, cùng trạng thái và cùng cách thao tác."
    >
      <AdminOperationsDashboard />
    </AdminShell>
  );
}
