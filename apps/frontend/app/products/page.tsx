import { AppHeader } from "@/components/mobile/AppHeader";
import { BottomNav } from "@/components/mobile/BottomNav";

const tabs = ["Tat ca", "Tra sua", "Mi cay", "Topping", "Bao bi", "Combo"];

const products = [
  { name: "Tran chau den 3Q", sku: "TC-3Q-1KG", price: "42.000d", group: "Topping", unit: "Goi 1kg", image: "🧋" },
  { name: "Bot sua Royal Auzan", sku: "TS-ROYAL-1KG", price: "125.000d", group: "Tra sua", unit: "Goi 1kg", image: "🥛" },
  { name: "Syrup Vani", sku: "SY-VANI-750ML", price: "72.000d", group: "Syrup", unit: "Chai 750ml", image: "🍯" },
  { name: "Sua dac Ong Tho", sku: "SD-ONGTHO-380G", price: "28.000d", group: "Sua", unit: "Lon 380g", image: "🥫" },
];

function ProductCard({ product }: { product: (typeof products)[number] }) {
  return (
    <article className="relative overflow-hidden rounded-[26px] border border-[#eee7dc] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
      <button aria-label="Favorite" className="absolute right-4 top-4 z-10 text-[28px] leading-none text-slate-400">♡</button>
      <div className="grid min-h-[202px] grid-cols-[1.05fr_0.95fr] gap-2">
        <div className="flex flex-col justify-between pr-1">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded-full bg-[#e5f6ee] px-4 py-2 text-sm font-black text-[#08775f]">{product.group}</span>
              <span className="text-sm font-black tracking-wide text-slate-400">{product.sku}</span>
            </div>
            <h2 className="text-[23px] font-black leading-tight tracking-tight text-[#0b1220]">{product.name}</h2>
            <p className="mt-2 text-[17px] font-semibold text-slate-500">{product.unit}</p>
            <p className="mt-4 text-[26px] font-black tracking-tight text-[#ff5a00]">{product.price}</p>
          </div>
          <div className="mt-5 flex w-[152px] overflow-hidden rounded-2xl border border-[#eee7dc] bg-white text-lg font-black text-[#0b1220]">
            <button className="h-12 flex-1 bg-white">−</button>
            <span className="grid h-12 flex-1 place-items-center border-x border-[#eee7dc] bg-[#fbfaf7]">1</span>
            <button className="h-12 flex-1 bg-white">+</button>
          </div>
        </div>
        <div className="flex flex-col items-end justify-end pt-8">
          <div className="grid h-[138px] w-full place-items-center rounded-[24px] bg-gradient-to-br from-[#fbf6ec] to-[#f2eee7] text-[74px] shadow-inner">{product.image}</div>
          <button className="mt-3 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#ff5a00] px-6 py-3 text-[17px] font-black text-white shadow-[0_10px_20px_rgba(255,90,0,0.24)]">
            <span className="text-xl">♧</span> Them
          </button>
        </div>
      </div>
    </article>
  );
}

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-[#f7f3eb] pb-28 text-[#0b1220]">
      <section className="mx-auto max-w-md px-4 py-5">
        <AppHeader />

        <h1 className="mt-7 text-[42px] font-black leading-none tracking-tight">San pham</h1>

        <div className="mt-6 flex gap-3">
          <label className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-[18px] border border-[#e9e2d8] bg-white px-4 shadow-sm">
            <span className="text-2xl text-slate-400">⌕</span>
            <input className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-[#0b1220] outline-none placeholder:text-slate-400" placeholder="Tim san pham, SKU..." />
          </label>
          <button className="flex h-14 items-center gap-2 rounded-[18px] border border-[#e9e2d8] bg-white px-5 text-[16px] font-black shadow-sm">⌯ Loc</button>
        </div>

        <section className="mt-5 overflow-hidden rounded-[24px] bg-[#fff1d7] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
          <div className="grid grid-cols-[1.05fr_0.95fr] gap-2">
            <div>
              <p className="text-[13px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">Bang gia si toan quoc</p>
              <h2 className="mt-2 text-[24px] font-black leading-tight tracking-tight">Gia tot cho don hang si dung luong lon</h2>
              <div className="mt-4 space-y-2 text-[14px] font-semibold text-slate-700">
                <p>✓ San pham chinh hang</p>
                <p>✓ Gia tot on dinh</p>
                <p>✓ Giao nhanh, ho tro 24/7</p>
              </div>
            </div>
            <div className="relative grid place-items-center">
              <span className="absolute right-0 top-0 rounded-full bg-[#08775f] px-4 py-3 text-center text-xs font-black leading-tight text-white">Uu dai<br />don si</span>
              <span className="text-[96px] drop-shadow-sm">📦</span>
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-2">
            <span className="h-2 w-5 rounded-full bg-[#ff5a00]" />
            <span className="h-2 w-2 rounded-full bg-white" />
            <span className="h-2 w-2 rounded-full bg-white" />
          </div>
        </section>

        <div className="mt-5 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none]">
          {tabs.map((tab, index) => (
            <button key={tab} className={`shrink-0 rounded-[15px] px-5 py-3 text-[15px] font-black shadow-sm ring-1 ring-[#e9e2d8] ${index === 0 ? "bg-[#ff5a00] text-white ring-[#ff5a00]" : "bg-white text-[#0b1220]"}`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {products.map((product) => <ProductCard key={product.sku} product={product} />)}
        </div>
      </section>

      <BottomNav active="products" />
    </main>
  );
}
