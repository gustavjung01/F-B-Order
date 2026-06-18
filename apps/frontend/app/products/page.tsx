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
    <article className="relative min-h-[176px] overflow-hidden rounded-[24px] border border-[#eee7dc] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.055)]">
      <button aria-label="Favorite" className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[25px] leading-none text-slate-400 shadow-sm ring-1 ring-[#eee7dc]">♡</button>

      <div className="pr-[136px]">
        <div className="flex max-w-[190px] items-center gap-2">
          <span className="rounded-full bg-[#e5f6ee] px-3 py-1.5 text-[12px] font-black text-[#08775f]">{product.group}</span>
          <span className="truncate text-[12px] font-black tracking-wide text-slate-400">{product.sku}</span>
        </div>
        <h2 className="mt-4 max-w-[190px] text-[21px] font-black leading-tight tracking-tight text-[#0b1220]">{product.name}</h2>
        <p className="mt-1 text-[15px] font-semibold text-slate-500">{product.unit}</p>
        <p className="mt-3 text-[24px] font-black tracking-tight text-[#ff5a00]">{product.price}</p>
      </div>

      <div className="absolute bottom-4 left-4 flex w-[132px] overflow-hidden rounded-[15px] border border-[#eee7dc] bg-white text-[16px] font-black text-[#0b1220]">
        <button className="h-11 flex-1 bg-white">−</button>
        <span className="grid h-11 flex-1 place-items-center border-x border-[#eee7dc] bg-[#fbfaf7]">1</span>
        <button className="h-11 flex-1 bg-white">+</button>
      </div>

      <div className="absolute bottom-3 right-3 top-12 w-[142px]">
        <div className="absolute inset-x-0 bottom-10 top-0 grid place-items-center rounded-[22px] bg-gradient-to-br from-[#fff8ef] to-[#f1ede6] text-[68px] shadow-inner">
          {product.image}
        </div>
        <button className="absolute bottom-0 right-0 inline-flex h-12 items-center justify-center gap-2 rounded-[16px] bg-[#ff5a00] px-5 text-[16px] font-black text-white shadow-[0_10px_20px_rgba(255,90,0,0.24)]">
          <span className="text-[18px]">♧</span> Them
        </button>
      </div>
    </article>
  );
}

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-[#f7f3eb] pb-28 pt-[92px] text-[#0b1220]">
      <AppHeader />

      <section className="mx-auto max-w-md px-4 py-4">
        <h1 className="text-[40px] font-black leading-none tracking-tight">San pham</h1>

        <div className="mt-5 flex gap-3">
          <label className="flex h-13 min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-[17px] border border-[#e9e2d8] bg-white px-4 shadow-sm">
            <span className="text-[22px] text-slate-400">⌕</span>
            <input className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#0b1220] outline-none placeholder:text-slate-400" placeholder="Tim san pham, SKU..." />
          </label>
          <button className="flex min-h-[52px] items-center gap-2 rounded-[17px] border border-[#e9e2d8] bg-white px-5 text-[15px] font-black shadow-sm">⌯ Loc</button>
        </div>

        <section className="mt-5 overflow-hidden rounded-[24px] bg-[#fff1d7] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.075)]">
          <div className="relative min-h-[210px]">
            <div className="relative z-10 max-w-[220px]">
              <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Bang gia si toan quoc</p>
              <h2 className="mt-3 text-[26px] font-black leading-[1.16] tracking-tight">Gia tot cho don hang si dung luong lon</h2>
              <div className="mt-4 space-y-2 text-[14px] font-semibold text-slate-700">
                <p>✓ San pham chinh hang</p>
                <p>✓ Gia tot on dinh</p>
                <p>✓ Giao nhanh, ho tro 24/7</p>
              </div>
            </div>
            <span className="absolute right-0 top-0 rounded-full bg-[#08775f] px-4 py-3 text-center text-xs font-black leading-tight text-white">Uu dai<br />don si</span>
            <span className="absolute bottom-8 right-4 text-[92px] drop-shadow-sm">📦</span>
          </div>
          <div className="flex justify-center gap-2">
            <span className="h-2 w-5 rounded-full bg-[#ff5a00]" />
            <span className="h-2 w-2 rounded-full bg-white" />
            <span className="h-2 w-2 rounded-full bg-white" />
          </div>
        </section>

        <div className="sticky top-[78px] z-30 -mx-4 mt-5 flex gap-3 overflow-x-auto bg-[#f7f3eb]/94 px-4 py-2 backdrop-blur-xl [-ms-overflow-style:none] [scrollbar-width:none]">
          {tabs.map((tab, index) => (
            <button key={tab} className={`shrink-0 rounded-[15px] px-5 py-3 text-[15px] font-black shadow-sm ring-1 ring-[#e9e2d8] ${index === 0 ? "bg-[#ff5a00] text-white ring-[#ff5a00]" : "bg-white text-[#0b1220]"}`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          {products.map((product) => <ProductCard key={product.sku} product={product} />)}
        </div>
      </section>

      <BottomNav active="products" />
    </main>
  );
}
