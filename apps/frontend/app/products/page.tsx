const products = [
  { name: "Tran chau den 3Q", sku: "TC-3Q-1KG", price: "42.000d", group: "Topping", unit: "Goi 1kg" },
  { name: "Bot sua beo F&B", sku: "BS-FB-25KG", price: "315.000d", group: "Tra sua", unit: "Bao 25kg" },
  { name: "Hong tra Assam", sku: "TEA-AS-500", price: "96.000d", group: "Tra sua", unit: "Tui 500g" },
  { name: "Sot mi cay Han", sku: "MC-HAN-1L", price: "89.000d", group: "Mi cay", unit: "Chai 1L" },
  { name: "Ly nhua 700ml", sku: "LY-700", price: "38.000d", group: "Bao bi", unit: "Cay 50 ly" },
  { name: "Combo mo quan", sku: "CB-START", price: "1.250.000d", group: "Combo", unit: "1 goi" },
];

const tabs = ["Tat ca", "Tra sua", "Mi cay", "Topping", "Bao bi", "Combo"];

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-[#f6f3ea] pb-20 text-slate-950">
      <section className="mx-auto max-w-6xl px-5 py-6">
        <div className="rounded-[2rem] bg-slate-950 p-6 text-white md:p-8">
          <p className="text-sm font-black uppercase text-teal-300">Bang hang si</p>
          <h1 className="mt-2 text-4xl font-black">San pham F&B</h1>
          <p className="mt-3 text-slate-300">Mock catalog de app nhin that hon. Sau nay thay bang Product API.</p>
          <div className="mt-6 flex gap-3 rounded-3xl bg-white p-2">
            <input className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-slate-950 outline-none" placeholder="Tim san pham, SKU..." />
            <button className="rounded-2xl bg-teal-600 px-5 py-3 font-black text-white">Tim</button>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button key={tab} className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm ring-1 ring-black/5">{tab}</button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <article key={product.sku} className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700">{product.group}</span>
                <span className="text-xs font-bold text-slate-400">{product.sku}</span>
              </div>
              <div className="mt-5 grid h-36 place-items-center rounded-[1.5rem] bg-slate-100 text-6xl">🧋</div>
              <h2 className="mt-5 text-xl font-black">{product.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{product.unit}</p>
              <div className="mt-5 flex items-center justify-between">
                <b className="text-2xl text-teal-700">{product.price}</b>
                <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Them</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
