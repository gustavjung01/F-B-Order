import { AppHeader } from "@/components/mobile/AppHeader";
import { BottomNav } from "@/components/mobile/BottomNav";

const tabs = ["Tat ca", "Tra sua", "Mi cay", "Topping", "Bao bi", "Combo"];

const products = [
  { name: "Tran chau den 3Q", sku: "TC-3Q-1KG", price: "42.000d", unit: "Goi 1kg", image: "🧋" },
  { name: "Bot sua Royal Auzan", sku: "TS-ROYAL-1KG", price: "125.000d", unit: "Goi 1kg", image: "🥛" },
  { name: "Syrup Vani", sku: "SY-VANI-750ML", price: "72.000d", unit: "Chai 750ml", image: "🍯" },
  { name: "Sua dac Ong Tho", sku: "SD-ONGTHO-380G", price: "28.000d", unit: "Lon 380g", image: "🥫" },
];

type BottomNavKey = "home" | "products" | "recipes" | "cart" | "account";

function ProductCard({ product }: { product: (typeof products)[number] }) {
  return (
    <article className="relative min-h-[164px] overflow-hidden rounded-[24px] border border-[#eee7dc] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.055)]">
      <div className="pb-16 pr-[128px]">
        <h2 className="max-w-[205px] text-[20px] font-black leading-tight tracking-tight text-[#0b1220]">{product.name}</h2>
        <p className="mt-2 text-[14px] font-semibold text-slate-500">{product.unit}</p>
        <p className="mt-3 text-[24px] font-black tracking-tight text-[#ff5a00]">{product.price}</p>
      </div>

      <div className="absolute right-3 top-4 grid h-[116px] w-[116px] place-items-center rounded-[24px] bg-gradient-to-br from-[#fff8ef] to-[#f1ede6] text-[64px] shadow-inner">
        {product.image}
      </div>

      <div className="absolute bottom-4 left-4 flex w-[132px] overflow-hidden rounded-[15px] border border-[#eee7dc] bg-white text-[16px] font-black text-[#0b1220]">
        <button type="button" aria-label={`Giam ${product.name}`} className="h-11 flex-1 bg-white">−</button>
        <span className="grid h-11 flex-1 place-items-center border-x border-[#eee7dc] bg-[#fbfaf7]">1</span>
        <button type="button" aria-label={`Tang ${product.name}`} className="h-11 flex-1 bg-white">+</button>
      </div>

      <button type="button" className="absolute bottom-4 right-4 inline-flex h-11 items-center justify-center rounded-[15px] bg-[#ff5a00] px-5 text-[15px] font-black text-white shadow-[0_10px_20px_rgba(255,90,0,0.22)]">
        Them
      </button>
    </article>
  );
}

export function ProductHome({ active = "home" }: { active?: BottomNavKey }) {
  return (
    <main className="min-h-screen bg-[#f7f3eb] pb-28 pt-[calc(env(safe-area-inset-top)+86px)] text-[#0b1220]">
      <AppHeader title="Bep Si F&B" subtitle="Dat hang nguyen lieu" />

      <section className="mx-auto max-w-md px-4 py-4">
        <h1 className="sr-only">San pham</h1>

        <div className="flex gap-3">
          <label className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-[17px] border border-[#e9e2d8] bg-white px-4 shadow-sm">
            <span className="text-[22px] text-slate-400">⌕</span>
            <input className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#0b1220] outline-none placeholder:text-slate-400" placeholder="Tim san pham, SKU..." />
          </label>
          <button type="button" className="flex min-h-[52px] items-center gap-2 rounded-[17px] border border-[#e9e2d8] bg-white px-5 text-[15px] font-black shadow-sm">⌯ Loc</button>
        </div>

        <section className="mt-4 overflow-hidden rounded-[24px] bg-[#fff1d7] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.075)]">
          <div className="relative min-h-[176px]">
            <div className="relative z-10 max-w-[220px]">
              <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Bang gia si toan quoc</p>
              <h2 className="mt-3 text-[24px] font-black leading-[1.16] tracking-tight">Gia tot cho don si dung luong lon</h2>
              <div className="mt-4 space-y-2 text-[14px] font-semibold text-slate-700">
                <p>✓ Hang chinh hang</p>
                <p>✓ Gia on dinh</p>
                <p>✓ Giao nhanh</p>
              </div>
            </div>
            <span className="absolute right-0 top-0 rounded-full bg-[#08775f] px-4 py-3 text-center text-xs font-black leading-tight text-white">Uu dai<br />don si</span>
            <span className="absolute bottom-4 right-3 text-[86px] drop-shadow-sm">📦</span>
          </div>
        </section>

        <div className="-mx-4 mt-4 overflow-hidden border-y border-[#eee7dc] bg-[#f7f3eb]/95">
          <div className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-4 py-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab, index) => (
              <button key={tab} type="button" aria-pressed={index === 0} className={`shrink-0 rounded-[15px] px-5 py-3 text-[15px] font-black shadow-sm ring-1 ring-[#e9e2d8] ${index === 0 ? "bg-[#ff5a00] text-white ring-[#ff5a00]" : "bg-white text-[#0b1220]"}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {products.map((product) => <ProductCard key={product.sku} product={product} />)}
        </div>
      </section>

      <BottomNav active={active} />
    </main>
  );
}
