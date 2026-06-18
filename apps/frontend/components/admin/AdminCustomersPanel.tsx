"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  shop_name: string;
  contact_name: string;
  phone: string;
  address: string;
  business_type: string | null;
  tax_code: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
};

export function AdminCustomersPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/customers", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "Khong tai duoc danh sach khach");
      setLoading(false);
      return;
    }
    setCustomers(data.customers || []);
    setLoading(false);
  }

  async function update(customerId: string, status: "approved" | "rejected") {
    const response = await fetch("/api/admin/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, status, rejectedReason: status === "rejected" ? "Can bo sung ho so" : "" }),
    });
    if (response.ok) await load();
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="rounded-[22px] bg-white p-5 font-black ring-1 ring-[#eee7dc]">Dang tai danh sach...</p>;
  if (error) return <p className="rounded-[22px] bg-red-50 p-5 font-black text-red-600 ring-1 ring-red-100">{error}</p>;

  return (
    <section className="space-y-3">
      {customers.length === 0 ? (
        <p className="rounded-[22px] bg-white p-5 font-black ring-1 ring-[#eee7dc]">Chua co ho so khach nao.</p>
      ) : null}

      {customers.map((customer) => (
        <article key={customer.id} className="rounded-[24px] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#eee7dc]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="rounded-full bg-[#f3f0ea] px-3 py-1 text-[11px] font-black uppercase text-slate-600">{customer.approval_status}</span>
              <h2 className="mt-3 text-[20px] font-black text-[#0b1220]">{customer.shop_name}</h2>
              <p className="mt-1 text-[13px] font-bold text-slate-600">{customer.contact_name} · {customer.phone}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => update(customer.id, "approved")} className="rounded-[14px] bg-emerald-600 px-3 py-2 text-[12px] font-black text-white">Duyet</button>
              <button onClick={() => update(customer.id, "rejected")} className="rounded-[14px] bg-red-600 px-3 py-2 text-[12px] font-black text-white">Tu choi</button>
            </div>
          </div>
          <div className="mt-3 rounded-[18px] bg-[#fbfaf7] p-3 text-[13px] font-bold leading-5 text-slate-600 ring-1 ring-[#eee7dc]">
            <p>{customer.address}</p>
            <p>{customer.business_type || "Chua co nganh hang"} · MST: {customer.tax_code || "Khong bat buoc"}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
