import Link from "next/link";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { isApprovedCustomer } from "@/lib/mockCustomer";

const recipes = [
  { name: "Tra sua dau nuong", time: "12 phut", icon: "🧋", items: ["Hong tra", "Bot sua", "Syrup dau nuong", "Tran chau"] },
  { name: "Mi cay kim chi hai san", time: "18 phut", icon: "🍜", items: ["Sot mi cay", "Mi Han", "Kim chi", "Topping hai san"] },
  { name: "Sua tuoi tran chau duong den", time: "10 phut", icon: "🥛", items: ["Sua tuoi", "Duong den", "Tran chau", "Kem beo"] },
];

export default function RecipesPage() {
  const approved = isApprovedCustomer;

  return (
    <MobilePageShell active="recipes" title="Cong thuc" subtitle={approved ? "Cong thuc chi tiet" : "Xem y tuong truoc"}>
      <section className="overflow-hidden rounded-[26px] bg-[#f4efff] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
        <div className="relative min-h-[160px]">
          <div className="relative z-10 max-w-[235px]">
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#7c3aed]">Cong thuc ban hang</p>
            <h1 className="mt-3 text-[25px] font-black leading-[1.16] tracking-tight">Xem y tuong mon, duyet shop de mo cong thuc</h1>
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700">Trang nay van mo cho khach xem. Chi phan cong thuc chi tiet va gom nguyen lieu moi can duyet.</p>
          </div>
          <span className="absolute bottom-2 right-3 text-[82px] drop-shadow-sm">🧑‍🍳</span>
        </div>
      </section>

      <div className="mt-4 space-y-3">
        {recipes.map((recipe, index) => (
          <article key={recipe.name} className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
            <div className="flex gap-3">
              <div className="grid h-[92px] w-[96px] shrink-0 place-items-center rounded-[24px] bg-gradient-to-br from-[#fffaf3] to-[#f4efff] text-[52px] shadow-inner ring-1 ring-white/80">{recipe.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#f4efff] px-3 py-1 text-[11px] font-black text-[#7c3aed] ring-1 ring-[#dccbff]">Y tuong #{index + 1}</span>
                  <span className="text-[12px] font-black text-slate-400">{recipe.time}</span>
                </div>
                <h2 className="mt-3 text-[19px] font-black leading-tight tracking-tight text-[#0b1220]">{recipe.name}</h2>
              </div>
            </div>

            {approved ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {recipe.items.map((item) => (
                    <span key={item} className="rounded-[14px] bg-[#fbfaf7] px-3 py-2 text-[12px] font-bold text-slate-600 ring-1 ring-[#eee7dc]">{item}</span>
                  ))}
                </div>
                <button type="button" className="mt-4 h-11 w-full rounded-[16px] bg-[#ff5a00] px-5 text-[15px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)]">
                  Them nguyen lieu
                </button>
              </>
            ) : (
              <>
                <div className="mt-4 rounded-[18px] bg-[#fbfaf7] p-4 ring-1 ring-[#eee7dc]">
                  <p className="text-[13px] font-bold leading-6 text-slate-600">Cong thuc chi tiet, dinh luong va danh sach nguyen lieu se mo sau khi shop duoc duyet.</p>
                </div>
                <Link href="/register" className="mt-4 flex h-11 items-center justify-center rounded-[16px] bg-[#0b1220] px-5 text-[15px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)]">
                  Tao ho so de mo cong thuc
                </Link>
              </>
            )}
          </article>
        ))}
      </div>
    </MobilePageShell>
  );
}
