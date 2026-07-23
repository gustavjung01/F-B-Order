import { AdminAiConsole } from "@/components/admin/AdminAiConsole";
import { AiRecipeDraftReviewQueue } from "@/components/admin/ai/AiRecipeDraftReviewQueue";
import { OperationalIntelligencePanel } from "@/components/admin/ai/OperationalIntelligencePanel";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminAiPage() {
  return (
    <AdminShell
      title="Trợ lý AI"
      subtitle="Phân tích dữ liệu, review Recipe draft và kiểm soát các thay đổi do AI đề xuất."
    >
      <div className="grid gap-5">
        <OperationalIntelligencePanel />
        <AiRecipeDraftReviewQueue />
        <AdminAiConsole />
      </div>
    </AdminShell>
  );
}
