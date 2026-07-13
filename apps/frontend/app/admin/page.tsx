import { AdminOperationsDashboard } from "@/components/admin/AdminOperationsDashboard";
import { AdminModuleNav } from "@/components/admin/AdminModuleNav";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <>
      <div className="sticky top-0 z-[70] border-b border-slate-200 bg-slate-100/95 px-4 py-3 backdrop-blur-xl md:px-8">
        <div className="mx-auto max-w-[1600px]">
          <AdminModuleNav />
        </div>
      </div>
      <AdminOperationsDashboard />
    </>
  );
}
