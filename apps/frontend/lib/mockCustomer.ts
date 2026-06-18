export type ApprovalStatus = "guest" | "pending" | "approved" | "rejected";

export const mockCustomer = {
  approvalStatus: "pending" as ApprovalStatus,
  shopName: "Tra Sua Miu Miu",
  contactName: "Chu quan",
  phone: "0900 000 000",
  address: "Quan 1, TP.HCM",
  taxCode: "",
  businessType: "Tra sua / topping",
  salesOwner: "Bep Si F&B",
};

export const isApprovedCustomer = mockCustomer.approvalStatus === "approved";

export function getApprovalLabel(status: ApprovalStatus) {
  if (status === "approved") return "Da duyet khach si";
  if (status === "pending") return "Cho admin duyet";
  if (status === "rejected") return "Can bo sung ho so";
  return "Chua dang ky khach si";
}

export function getApprovalTone(status: ApprovalStatus) {
  if (status === "approved") return "bg-[#e5f6ee] text-[#08775f] ring-[#b9eadb]";
  if (status === "pending") return "bg-[#fff3ea] text-[#ff5a00] ring-[#ffd0b3]";
  if (status === "rejected") return "bg-[#fff0ef] text-[#dc2626] ring-[#ffc9c3]";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}
