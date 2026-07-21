import { AdminAiConsole } from "@/components/admin/AdminAiConsole";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminAiPage() {
  return (
    <AdminShell
      title="Trợ lý AI"
      subtitle="Phân tích dữ liệu, tạo draft và gửi action cần phê duyệt."
    >
      <AdminAiConsole />
    </AdminShell>
  );
}
