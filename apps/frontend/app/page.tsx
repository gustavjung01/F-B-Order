const categories = [
  { name: "Tra sua", count: "128 mat hang", icon: "🧋" },
  { name: "Mi cay", count: "64 mat hang", icon: "🍜" },
  { name: "Topping", count: "92 mat hang", icon: "🧊" },
  { name: "Combo quan", count: "18 goi ban chay", icon: "📦" },
];

const products = [
  { name: "Tran chau den 3Q", price: "42.000d", tag: "Ban chay", unit: "goi 1kg" },
  { name: "Bot sua beo F&B", price: "315.000d", tag: "Gia si", unit: "bao 25kg" },
  { name: "Sot mi cay Han vi bo", price: "89.000d", tag: "Moi", unit: "chai 1L" },
];

const recipes = ["Tra sua dau nuong", "Mi cay kim chi hai san", "Sua tuoi tran chau duong den"];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f6f3ea] pb-24 text-slate-950">
      <section className="mx-auto max-w-6xl px-5 py-5">
        <header className="flex items-center justify-between rounded-full bg-white/80 px-4 py-3 shadow-sm ring-1 ring-black/5 backdrop-blur">
          <a href="/" className="flex items-center gap-2 font-black tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-700 text-white">B</span>
            <span>Bep Si F&B</span>
          </a>
          <nav className="hidden items-center gap-6 text-sm font-bold text-slate-600 md:flex">
            <a href="/products">San pham</a>
            <a href="/recipes">Cong thuc</a>
            <a href="/orders">Don hang</a>
          </nav>
          <a href="/sign-in" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white">Dang nhap</a>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm md:p-10">
            <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-teal-100">Dat hang nguyen lieu F&B cho quan</p>
            <h1 className="mt-6 max-w-2xl text-4xl font-black leading-tight md:text-6xl">
              Nhap hang nhanh, gia si ro, don gon trong mot app.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 md:text-lg">
              Tra sua, mi cay, topping, bao bi va cong thuc van hanh quan. Lam PWA truoc, native app de sau.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="rounded-2xl bg-teal-500 px-5 py-3 font-black text-slate-950" href="/products">Xem bang hang</a>
              <a className="rounded-2xl bg-white/10 px-5 py-3 font-black text-white" href="/recipes">Xem cong thuc</a>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-3xl bg-white/10 p-4"><b className="text-2xl">300+</b><p className="text-xs text-slate-300">SKU</p></div>
              <div className="rounded-3xl bg-white/10 p-4"><b className="text-2xl">24h</b><p className="text-xs text-slate-300">Xu ly don</p></div>
              <div className="rounded-3xl bg-white/10 p-4"><b className="text-2xl">PWA</b><p className="text-xs text-slate-300">Cai man hinh</p></div>
            </div>
          </div>

          <aside className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-black uppercase text-orange-600">Chuong trinh hom nay</p>
            <h2 className="mt-2 text-3xl font-black">Combo mo quan tra sua</h2>
            <p className="mt-3 text-slate-600">Bot sua, tran chau, syrup, ly nap va ong hut. Gia mau de test UI.</p>
            <div className="mt-6 rounded-3xl bg-orange-50 p-5">
              <p className="text-sm font-bold text-orange-700">Tiet kiem den</p>
              <p className="text-5xl font-black text-orange-600">12%</p>
            </div>
            <a href="/cart" className="mt-5 block rounded-2xl bg-orange-500 px-5 py-3 text-center font-black text-white">Them combo</a>
          </aside>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          {categories.map((item) => (
            <a key={item.name} href="/products" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="text-3xl">{item.icon}</div>
              <h3 className="mt-4 text-lg font-black">{item.name}</h3>
              <p className="text-sm text-slate-500">{item.count}</p>
            </a>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
          <div>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-sm font-black uppercase text-teal-700">Ban hang nhanh</p>
                <h2 className="text-3xl font-black">San pham noi bat</h2>
              </div>
              <a href="/products" className="text-sm font-black text-teal-700">Xem tat ca</a>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {products.map((product) => (
                <article key={product.name} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700">{product.tag}</span>
                  <div className="mt-5 grid h-28 place-items-center rounded-3xl bg-slate-100 text-5xl">🧾</div>
                  <h3 className="mt-4 font-black">{product.name}</h3>
                  <p className="text-sm text-slate-500">{product.unit}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <b className="text-lg text-teal-700">{product.price}</b>
                    <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Them</button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-black uppercase text-pink-700">Giu chan khach</p>
            <h2 className="mt-2 text-3xl font-black">Cong thuc F&B</h2>
            <p className="mt-3 text-slate-600">Noi dung cong thuc giup khach quay lai app, khong chi vao luc dat hang.</p>
            <div className="mt-5 space-y-3">
              {recipes.map((recipe, index) => (
                <a key={recipe} href="/recipes" className="flex items-center gap-3 rounded-3xl bg-pink-50 p-4">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-pink-600 font-black text-white">{index + 1}</span>
                  <span className="font-black">{recipe}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </section>

      <nav className="fixed inset-x-4 bottom-4 z-20 grid grid-cols-4 rounded-3xl bg-slate-950 p-2 text-center text-xs font-black text-white shadow-2xl md:hidden">
        <a className="rounded-2xl bg-white/10 px-2 py-3" href="/">Home</a>
        <a className="px-2 py-3" href="/products">Hang</a>
        <a className="px-2 py-3" href="/recipes">Bep</a>
        <a className="px-2 py-3" href="/cart">Gio</a>
      </nav>
    </main>
  );
}
