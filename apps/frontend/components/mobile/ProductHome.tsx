import { AccountAction } from "@/components/auth/AccountAction";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { getApprovalLabel, getApprovalTone, isApprovedCustomer, mockCustomer } from "@/lib/mockCustomer";

const tabs = [
  { label: "Tất cả", icon: "▦", tone: "bg-[#fff3ea] text-[#ff5a00] ring-[#ffd0b3]" },
  { label: "Trà sữa", icon: "🧋", tone: "bg-[#eefbf6] text-[#08775f] ring-[#b9eadb]" },
  { label: "Mì cay", icon: "🍜", tone: "bg-[#fff0ef] text-[#dc2626] ring-[#ffc9c3]" },
  { label: "Topping", icon: "🧊", tone: "bg-[#eef6ff] text-[#2563eb] ring-[#c7ddff]" },
  { label: "Bao bì", icon: "🥡", tone: "bg-[#fff8e8] text-[#b77900] ring-[#ffe1a8]" },
  { label: "Combo", icon: "📦", tone: "bg-[#f4efff] text-[#7c3aed] ring-[#dccbff]" },
];

const products = [
  { name: "Tran chau den 3Q", sku: "TC-3Q-1KG", price: "42.000d", unit: "Goi 1kg", image: "🧋" },
  { name: "Bot sua Royal Auzan", sku: "TS-ROYAL-1KG", price: "125.000d", unit: "Goi 1kg", image: "🥛" },
  { name: "Syrup Vani", sku: "SY-VANI-750ML", price: "72.000d", unit: "Chai 750ml", image: "🍯" },
  { name: "Sua dac Ong Tho", sku: "SD-ONGTHO-380G", price: "28.000d", unit: "Lon 380g", image: "🥫" },
];

type BottomNavKey = "home" | "products" | "recipes" | "cart" | "account";

function ProductCard({ product, approved }: { product: (typeof products)[number]; approved: boolean }) {
  return (
    <article className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
      <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/90" />
      <span className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[#fff1d7]/70 blur-2xl" />

      <div className="relative flex gap-3">
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="max-w-[205px] text-[20px] font-black leading-tight tracking-tight text-[#0b1220]">{product.name}</h2>
          <p className="mt-2 text-[14px] font-semibold text-slate-500">{product.unit}</p>
          {approved ? (
            <p className="mt-3 text-[24px] font-black tracking-tight text-[#ff5a00]">{product.price}</p>
          ) : (
            <p className="mt-3 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-[13px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Gia si sau duyet</p>
          )}
        </div>

        <div className="grid h-[112px] w-[116px] shrink-0 place-items-center rounded-[25px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[62px] shadow-[inset_0_2px_8px_rgba(255,255,255,0.95),inset_0_-10px_22px_rgba(15,23,42,0.06)] ring-1 ring-white/80">
          {product.image}
        </div>
      </div>

      {approved ? (
        <div className="relative mt-4 flex items-center gap-3">
          <div className="grid h-11 flex-1 grid-cols-3 overflow-hidden rounded-[16px] border border-[#eee7dc] bg-[#fbfaf7] text-[16px] font-black text-[#0b1220] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <button type="button" aria-label={`Giam ${product.name}`} className="bg-white active:bg-[#fff3ea]">−</button>
            <span className="grid place-items-center border-x border-[#eee7dc] bg-[#fbfaf7]">1</span>
            <button type="button" aria-label={`Tang ${product.name}`} className="bg-white active:bg-[#fff3ea]">+</button>
          </div>

          <button type="button" className="h-11 min-w-[112px] rounded-[16px] bg-[#ff5a00] px-5 text-[15px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.26)] ring-1 ring-[#ff7a2e]/40 active:translate-y-px active:shadow-[0_7px_14px_rgba(255,90,0,0.22)]">
            Them
          </button>
        </div>
      ) : (
        <div className="relative mt-4 flex items-center gap-3">
          <button type="button" className="h-11 flex-1 rounded-[16px] bg-[#fbfaf7] px-4 text-[15px] font-black text-[#0b1220] ring-1 ring-[#eee7dc]">
            Xem chi tiet
          </button>
          <AccountAction href="/register" signedOutLabel="Mo gia" className="flex h-11 min-w-[112px] items-center justify-center rounded-[16px] bg-[#0b1220] px-4 text-[14px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)]">Mo gia</AccountAction>
        </div>
      )}
    </article>
  );
}

export function ProductHome({ active = "home" }: { active?: BottomNavKey }) {
  const approved = isApprovedCustomer;

  return (
    <MobilePageShell active={active} title="Bep Si F&B" subtitle={approved ? "Bang gia khach si" : "Xem catalog truoc"}>
      <h1 className="sr-only">San pham</h1>

      <section className="overflow-hidden rounded-[26px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
        <div className="relative min-h-[188px]">
          <div className="relative z-10 max-w-[226px]">
            <span className={`inline-flex rounded-full px-3 py-1.5 text-[12px] font-black ring-1 ${getApprovalTone(mockCustomer.approvalStatus)}`}>
              {getApprovalLabel(mockCustomer.approvalStatus)}
            </span>
            <h2 className="mt-3 text-[24px] font-black leading-[1.16] tracking-tight">
              {approved ? "Bang gia si da mo cho shop cua ban" : "Xem san pham truoc, dang nhap de mo gia"}
            </h2>
            <div className="mt-4 space-y-2 text-[14px] font-semibold text-slate-700">
              <p>✓ Ai cung xem duoc catalog san pham</p>
              <p>✓ Dang nhap tai khoan bang popup Clerk</p>
              <p>✓ Ho so quan duyet xong moi mo gia</p>
            </div>
          </div>
          <span className="absolute right-0 top-0 rounded-full bg-[#08775f] px-4 py-3 text-center text-xs font-black leading-tight text-white shadow-[0_10px_18px_rgba(8,119,95,0.18)]">Khach<br />si</span>
          <span className="absolute bottom-4 right-3 text-[86px] drop-shadow-sm">📦</span>
        </div>
      </section>

      <div className="-mx-4 mt-4 overflow-hidden border-y border-[#eee7dc] bg-[#f7f3eb]/95">
        <div className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-4 py-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab, index) => (
            <button key={tab.label} type="button" aria-pressed={index === 0} className={`inline-flex shrink-0 items-center gap-1.5 rounded-[14px] px-3.5 py-2.5 text-[13px] font-black shadow-sm ring-1 ${index === 0 ? "bg-[#ff5a00] text-white ring-[#ff5a00] shadow-[0_8px_16px_rgba(255,90,0,0.18)]" : tab.tone}`}>
              <span className="text-[16px] leading-none">{tab.icon}</span>
              <span className="leading-none">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {products.map((product) => <ProductCard key={product.sku} product={product} approved={approved} />)}
      </div>

      {!approved ? (
        <div className="mt-4">
          <AccountAction href="/register" signedOutLabel="Dang nhap de mo gia si" className="block w-full rounded-[20px] bg-[#0b1220] px-5 py-4 text-center text-[15px] font-black text-white shadow-[0_14px_26px_rgba(15,23,42,0.18)]">Tao ho so quan de mo gia si</AccountAction>
        </div>
      ) : null}
    </MobilePageShell>
  );
}
