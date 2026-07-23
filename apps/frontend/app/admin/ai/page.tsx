import { AdminAiConsole } from "@/components/admin/AdminAiConsole";
import { AiRecipeDraftReviewQueue } from "@/components/admin/ai/AiRecipeDraftReviewQueue";
import { KitchenCapacitySimulationPanel } from "@/components/admin/ai/KitchenCapacitySimulationPanel";
import { OperationalIntelligencePanel } from "@/components/admin/ai/OperationalIntelligencePanel";
import { RecipeRdPanel } from "@/components/admin/ai/RecipeRdPanel";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default function AdminAiPage() {
  return (
    <AdminShell
      title="Trợ lý AI"
      subtitle="Phân tích dữ liệu, mô phỏng năng lực bếp, R&D công thức, review Recipe draft và kiểm soát các thay đổi do AI đề xuất."
    >
      <div className="grid gap-5">
        <OperationalIntelligencePanel />
        <KitchenCapacitySimulationPanel />
        <RecipeRdPanel />
        <AiRecipeDraftReviewQueue />
        <AdminAiConsole />
      </div>
    </AdminShell>
  );
}
