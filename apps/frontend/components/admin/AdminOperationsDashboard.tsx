"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { AdminCustomersPanel } from "@/components/admin/AdminCustomersPanel";
import { AdminOrdersPanel } from "@/components/admin/AdminOrdersPanel";
import { AdminAlert, AdminSegmentedTabs, AdminSurface, AdminSurfaceBody, AdminSurfaceHeader } from "@/components/admin/ui/AdminUI";

export function AdminOperationsDashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const [tab, setTab] = useState<"customers" | "orders">("customers");

  if (!isLoaded) {
    return <AdminSurface><AdminSurfaceBody className="font-bold text-slate-600">Đang tải phiên đăng nhập…</AdminSurfaceBody></AdminSurface>;
  }

  if (!isSignedIn) {
    return <AdminAlert tone="warning" title="Cần đăng nhập">Bạn cần đăng nhập tài khoản admin để mở khu vực vận hành.</AdminAlert>;
  }

  return (
    <AdminSurface>
      <AdminSurfaceHeader
        eyebrow="Operations"
        title={tab === "customers" ? "Khách hàng" : "Đơn hàng"}
        description={tab === "customers"
          ? "Tìm hồ sơ, kiểm tra thông tin và ra quyết định duyệt trong dialog thống nhất."
          : "Theo dõi đơn, liên hệ khách và chuyển trạng thái theo đúng luồng vận hành."}
        actions={(
          <AdminSegmentedTabs
            value={tab}
            onChange={(value) => setTab(value as "customers" | "orders")}
            items={[
              { value: "customers", label: "Khách hàng" },
              { value: "orders", label: "Đơn hàng" },
            ]}
          />
        )}
      />
      <AdminSurfaceBody className="bg-slate-50/70">
        {tab === "customers" ? <AdminCustomersPanel /> : <AdminOrdersPanel />}
      </AdminSurfaceBody>
    </AdminSurface>
  );
}
