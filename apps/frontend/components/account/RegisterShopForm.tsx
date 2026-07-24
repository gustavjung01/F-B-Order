"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const provinceOptions = [
  "TP.HCM",
  "Hà Nội",
  "Đà Nẵng",
  "Cần Thơ",
  "Bình Dương",
  "Đồng Nai",
  "Long An",
  "Bà Rịa - Vũng Tàu",
  "Khánh Hòa",
  "Lâm Đồng",
  "Khác",
];

const businessTypes = [
  "Trà sữa / topping",
  "Mì cay / ăn vặt",
  "Cà phê / nước giải khát",
  "Nhà hàng / quán ăn",
  "Đại lý / tạp hóa",
  "Bếp online / mang đi",
  "Khác",
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

type CustomerProfile = {
  id: string;
  shopName: string;
  contactName: string;
  phone: string;
  address: string;
  taxCode: string;
  businessType: string;
  note: string;
  approvalStatus: "pending" | "approved" | "rejected";
};

type ProfileResponse = {
  profile?: CustomerProfile | null;
  error?: string;
};

const initialState: FormState = {
  shopName: "",
  contactName: "",
  phone: "",
  streetAddress: "",
  provinceCity: "TP.HCM",
  taxCode: "",
  businessType: "Trà sữa / topping",
  note: "",
};

function splitAddress(address: string) {
  const normalized = address.trim();
  const province = provinceOptions.find(
    (option) => option !== "Khác" && normalized.endsWith(`, ${option}`),
  );

  if (!province) {
    return { streetAddress: normalized, provinceCity: "Khác" };
  }

  return {
    streetAddress: normalized.slice(0, -province.length - 2).trim(),
    provinceCity: province,
  };
}

function profileToForm(profile: CustomerProfile): FormState {
  const address = splitAddress(profile.address || "");
  return {
    shopName: profile.shopName || "",
    contactName: profile.contactName || "",
    phone: profile.phone || "",
    streetAddress: address.streetAddress,
    provinceCity: address.provinceCity,
    taxCode: profile.taxCode || "",
    businessType: profile.businessType || "Khác",
    note: profile.note || "",
  };
}

function profileStatusLabel(status: CustomerProfile["approvalStatus"] | null) {
  if (status === "approved") return "Hồ sơ đã được duyệt";
  if (status === "rejected") return "Hồ sơ cần cập nhật";
  return "Hồ sơ đang chờ duyệt";
}

export function RegisterShopForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [existingProfile, setExistingProfile] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<CustomerProfile["approvalStatus"] | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setProfileLoading(true);
      setError("");

      try {
        const response = await fetch("/api/customer-profile", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as ProfileResponse;
        if (!active) return;

        if (!response.ok) {
          setError(
            data.error === "AUTH_REQUIRED"
              ? "Bạn cần đăng nhập để quản lý hồ sơ quán."
              : "Không tải được hồ sơ hiện tại từ backend.",
          );
          return;
        }

        if (data.profile) {
          setExistingProfile(true);
          setApprovalStatus(data.profile.approvalStatus);
          setForm(profileToForm(data.profile));
        }
      } catch {
        if (active) setError("Không kết nối được backend để tải hồ sơ hiện tại.");
      } finally {
        if (active) setProfileLoading(false);
      }
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

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
      const data = (await response.json().catch(() => ({}))) as ProfileResponse;

      if (!response.ok) {
        setError(
          data.error === "MISSING_REQUIRED_FIELDS"
            ? "Vui lòng nhập đầy đủ tên quán, người liên hệ, số điện thoại và địa chỉ."
            : "Không thể lưu hồ sơ lúc này. Vui lòng kiểm tra thông tin và thử lại.",
        );
        return;
      }

      setExistingProfile(true);
      setApprovalStatus(data.profile?.approvalStatus || "pending");
      setMessage("Đã lưu hồ sơ quán.");
      router.replace("/account");
      router.refresh();
    } catch {
      setError("Không thể lưu hồ sơ lúc này. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }

  if (profileLoading) {
    return (
      <section className="rounded-[22px] bg-white p-5 font-black text-slate-500 ring-1 ring-[#efe7dc]">
        Đang tải hồ sơ quán từ backend...
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[22px] bg-white p-5 ring-1 ring-[#efe7dc]">
        <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ring-1 ${existingProfile ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-amber-50 text-amber-700 ring-amber-100"}`}>
          {existingProfile ? "Đã có hồ sơ" : "Chưa có hồ sơ"}
        </span>
        <h2 className="mt-3 text-2xl font-black text-[#0b1220]">
          {existingProfile ? profileStatusLabel(approvalStatus) : "Tạo hồ sơ quán lần đầu"}
        </h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
          {existingProfile
            ? "Thông tin bên dưới đã được nạp từ backend. Chỉ chỉnh sửa phần cần thay đổi rồi bấm Lưu thay đổi."
            : "Hoàn tất thông tin quán một lần để gửi xét duyệt quyền mua sỉ."}
        </p>
      </section>

      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Tên shop / quán <b className="text-[#ff5a00]">*</b></span>
          <input required value={form.shopName} onChange={(event) => setField("shopName", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="Ví dụ: Trà sữa Miu Miu" />
        </label>

        <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Người liên hệ <b className="text-[#ff5a00]">*</b></span>
          <input required value={form.contactName} onChange={(event) => setField("contactName", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="Tên chủ quán hoặc quản lý" />
        </label>

        <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Số điện thoại <b className="text-[#ff5a00]">*</b></span>
          <input required inputMode="tel" value={form.phone} onChange={(event) => setField("phone", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="Số điện thoại liên hệ" />
        </label>

        <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Tỉnh / thành phố <b className="text-[#ff5a00]">*</b></span>
          <select required value={form.provinceCity} onChange={(event) => setField("provinceCity", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none">
            {provinceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc] md:col-span-2">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Số nhà và tên đường <b className="text-[#ff5a00]">*</b></span>
          <input required value={form.streetAddress} onChange={(event) => setField("streetAddress", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="Ví dụ: 25 Nguyễn Trãi, phường Bến Thành, Quận 1" />
        </label>

        <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Loại hình kinh doanh <b className="text-[#ff5a00]">*</b></span>
          <select required value={form.businessType} onChange={(event) => setField("businessType", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none">
            {businessTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc]">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Mã số thuế</span>
          <input value={form.taxCode} onChange={(event) => setField("taxCode", event.target.value)} className="mt-2 w-full border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="Không bắt buộc" />
        </label>

        <label className="block rounded-[22px] bg-white p-4 ring-1 ring-[#eee7dc] md:col-span-2">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Nhu cầu nhập hàng</span>
          <textarea value={form.note} onChange={(event) => setField("note", event.target.value)} className="mt-2 min-h-24 w-full resize-none border-0 bg-transparent text-[16px] font-black outline-none placeholder:text-slate-300" placeholder="Ví dụ: Nhập topping, bột sữa, ly và nắp hằng tháng..." />
        </label>

        <div className="md:col-span-2">
          {error ? <p className="mb-3 rounded-[16px] bg-red-50 px-4 py-3 text-[13px] font-black text-red-600 ring-1 ring-red-100">{error}</p> : null}
          {message ? <p className="mb-3 rounded-[16px] bg-emerald-50 px-4 py-3 text-[13px] font-black text-emerald-700 ring-1 ring-emerald-100">{message}</p> : null}
          <button disabled={loading} className="w-full rounded-[20px] bg-[#ff5a00] px-5 py-4 text-[15px] font-black text-white shadow-[0_14px_26px_rgba(255,90,0,0.22)] disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Đang lưu hồ sơ..." : existingProfile ? "Lưu thay đổi" : "Gửi hồ sơ xét duyệt"}
          </button>
        </div>
      </form>
    </div>
  );
}
