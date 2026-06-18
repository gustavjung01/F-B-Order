"use client";

import { useState } from "react";

const provinceOptions = [
  "TP.HCM",
  "Ha Noi",
  "Da Nang",
  "Can Tho",
  "Binh Duong",
  "Dong Nai",
  "Long An",
  "Ba Ria - Vung Tau",
  "Khanh Hoa",
  "Lam Dong",
  "Khac",
];

const businessTypes = [
  "Tra sua / topping",
  "Mi cay / an vat",
  "Cafe / nuoc giai khat",
  "Nha hang / quan an",
  "Dai ly / tap hoa",
  "Bep online / take away",
  "Khac",
];

type FormState = {
  shopName: string;
  contactName: string;
  phone: string;
  streetAddress: string;
  provinceCity: string;
  taxCode: string;
  businessType: string;
  note: string;
};

const initialState: FormState = {
  shopName: "",
  contactName: "",
  phone: "",
  streetAddress: "",
  provinceCity: "TP.HCM",
  taxCode: "",
  businessType: "Tra sua / topping",
  note: "",
};

export function RegisterShopForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function setField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    const address = `${form.streetAddress.trim()}, ${form.provinceCity}`;

    try {
      const response = await fetch("/api/customer-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: form.shopName,
          contactName: form.contactName,
          phone: form.phone,
          address,
          taxCode: form.taxCode,
          businessType: form.businessType,
          note: form.note,
        }),
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
      <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Ten shop / quan <b className="text-[#ff5a00]">*</b></span>
        <input required value={form.shopName} onChange={(event) => setField("shopName", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="VD: Tra sua Miu Miu" />
      </label>

      <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Nguoi lien he <b className="text-[#ff5a00]">*</b></span>
        <input required value={form.contactName} onChange={(event) => setField("contactName", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="Ten chu quan / quan ly" />
      </label>

      <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">So dien thoai <b className="text-[#ff5a00]">*</b></span>
        <input required inputMode="tel" value={form.phone} onChange={(event) => setField("phone", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="090..." />
      </label>

      <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Tinh / thanh pho <b className="text-[#ff5a00]">*</b></span>
        <select required value={form.provinceCity} onChange={(event) => setField("provinceCity", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none">
          {provinceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>

      <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc] md:col-span-2">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">So nha va ten duong <b className="text-[#ff5a00]">*</b></span>
        <input required value={form.streetAddress} onChange={(event) => setField("streetAddress", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="VD: 25 Nguyen Trai, Phuong Ben Thanh, Quan 1" />
      </label>

      <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Loai hinh kinh doanh <b className="text-[#ff5a00]">*</b></span>
        <select required value={form.businessType} onChange={(event) => setField("businessType", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none">
          {businessTypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>

      <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Ma so thue</span>
        <input value={form.taxCode} onChange={(event) => setField("taxCode", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="Khong bat buoc" />
      </label>

      <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc] md:col-span-2">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Ghi chu nhu cau nhap hang</span>
        <textarea value={form.note} onChange={(event) => setField("note", event.target.value)} className="mt-2 min-h-24 w-full resize-none border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="VD: Moi thang nhap topping, bot sua, ly nap..." />
      </label>

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
