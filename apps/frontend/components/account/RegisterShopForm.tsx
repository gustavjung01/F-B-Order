"use client";

import { useState } from "react";

const fields = [
  { key: "shopName", label: "Ten shop / quan", placeholder: "VD: Tra sua Miu Miu", required: true },
  { key: "contactName", label: "Nguoi lien he", placeholder: "Ten chu quan / quan ly", required: true },
  { key: "phone", label: "So dien thoai", placeholder: "090...", required: true },
  { key: "address", label: "Dia chi giao hang", placeholder: "So nha, phuong, quan, tinh/thanh", required: true },
  { key: "taxCode", label: "Ma so thue", placeholder: "Khong bat buoc", required: false },
  { key: "businessType", label: "Nganh hang", placeholder: "Tra sua / mi cay / cafe / dai ly...", required: false },
] as const;

type FormState = Record<(typeof fields)[number]["key"], string>;

const initialState: FormState = {
  shopName: "",
  contactName: "",
  phone: "",
  address: "",
  taxCode: "",
  businessType: "",
};

export function RegisterShopForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/customer-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "SUBMIT_FAILED");
      setMessage("Da gui ho so quan. Trang thai hien tai: cho admin duyet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Khong gui duoc ho so. Thu lai sau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      {fields.map((field) => (
        <label key={field.key} className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
            {field.label} {field.required ? <b className="text-[#ff5a00]">*</b> : null}
          </span>
          <input
            required={field.required}
            value={form[field.key]}
            onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
            className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300"
            placeholder={field.placeholder}
          />
        </label>
      ))}

      <div className="md:col-span-2">
        {error ? <p className="mb-3 rounded-[16px] bg-red-50 px-4 py-3 text-[13px] font-black text-red-600 ring-1 ring-red-100">{error}</p> : null}
        {message ? <p className="mb-3 rounded-[16px] bg-emerald-50 px-4 py-3 text-[13px] font-black text-emerald-700 ring-1 ring-emerald-100">{message}</p> : null}
        <button disabled={loading} className="w-full rounded-[20px] bg-[#ff5a00] px-5 py-4 text-[15px] font-black text-white shadow-[0_14px_26px_rgba(255,90,0,0.22)] disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? "Dang gui ho so..." : "Gui ho so cho admin duyet"}
        </button>
      </div>
    </form>
  );
}
