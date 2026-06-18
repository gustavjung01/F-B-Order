import Link from "next/link";
import { AuthControls } from "@/components/auth/AuthControls";
import { getApprovalLabel, getApprovalTone, isApprovedCustomer, mockCustomer } from "@/lib/mockCustomer";

const categories = ["Tat ca", "Tra sua", "Mi cay", "Topping", "Bao bi", "Combo"];

const products = [
  { name: "Tran chau den 3Q", unit: "Goi 1kg", price: "42.000d", image: "🧋" },
  { name: "Bot sua Royal Auzan", unit: "Goi 1kg", price: "125.000d", image: "🥛" },
  { name: "Syrup Vani", unit: "Chai 750ml", price: "72.000d", image: "🍯" },
  { name: "Sua dac Ong Tho", unit: "Lon 380g", price: "28.000d", image: "🥫" },
];

export function DesktopHome() {
  const approved = isApprovedCustomer;

  return (
    <main className="min-h-screen bg-[#f7f3eb] text-[#0b1220]">
      <header className="sticky top-0 z-40 border-b border-[#eee7dc] bg-[#f7f3eb]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ff5a00] text-2xl font-black text-white shadow-[0_12px_24px_rgba(255,90,0,0.25)]">B</span>
            <span>
              <span className="block text-xl font-black tracking-tight">Bep Si F&B</span>
              <span className="block text-sm font-bold text-slate-500">Catalog nguyen lieu cho khach si</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 text-sm font-black text-slate-600">
            <Link href="/" className="rounded-full bg-white px-4 py-2 text-[#ff5a00] shadow-sm ring-1 ring-[#eee7dc]">San pham</Link>
            <Link href="/recipes" className="rounded-full px-4 py-2 hover:bg-white">Cong thuc</Link>
            <Link href="/cart" className="rounded-full px-4 py-2 hover:bg-white">Gio hang</Link>
            <Link href="/account" className="rounded-full px-4 py-2 hover:bg-white">Tai khoan</Link>
          </nav>

          <AuthControls />
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl grid-cols-[1.1fr_0.9fr] gap-8 px-8 py-10">
        <div className="rounded-[40px] bg-[#fff1d7] p-10 shadow-[0_24px_60px_rgba(15,23,42,0.10)] ring-1 ring-white/80">
          <span className={`inline-flex rounded-full px-4 py-2 text-sm font-black ring-1 ${getApprovalTone(mockCustomer.approvalStatus)}`}>
            {getApprovalLabel(mockCustomer.approvalStatus)}
          </span>
          <h1 className="mt-6 max-w-3xl text-6xl font-black leading-[0.98] tracking-[-0.055em]">
            Catalog nguyen lieu F&B cho quan tra sua, mi cay va topping.
          </h1>
          <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-slate-700">
            Khach vao web xem san pham binh thuong. Tai khoan dung de dang nhap; ho so quan dung de admin duyet mo gia si.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/sign-up" className="rounded-2xl bg-[#ff5a00] px-6 py-4 text-base font-black text-white shadow-[0_16px_28px_rgba(255,90,0,0.25)]">Dang ky tai khoan</Link>
            <Link href="/register" className="rounded-2xl bg-white px-6 py-4 text-base font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">Ho so quan</Link>
            <Link href="/recipes" className="rounded-2xl bg-white px-6 py-4 text-base font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">Xem cong thuc</Link>
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="rounded-[34px] bg-white p-6 shadow-[0_20px_48px_rgba(15,23,42,0.09)] ring-1 ring-[#efe7dc]">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#08775f]">Quy trinh khach si</p>
            <div className="mt-5 space-y-3">
              {["Xem catalog san pham", "Tao tai khoan", "Gui ho so quan", "Admin duyet mo gia"].map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-[#fbfaf7] p-3 ring-1 ring-[#eee7dc]">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#08775f] text-sm font-black text-white">{index + 1}</span>
                  <span className="font-black">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[34px] bg-[#0b1220] p-6 text-white shadow-[0_20px_48px_rgba(15,23,42,0.14)]">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-200">PWA mobile</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight">Quet QR de mo app tren dien thoai</h2>
            <p className="mt-3 font-semibold leading-7 text-slate-300">Mobile van giu giao dien PWA rieng, gon nhu app dat hang.</p>
          </div>
        </aside>
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-14">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#ff5a00]">Danh muc</p>
            <h2 className="mt-2 text-4xl font-black tracking-tight">San pham noi bat</h2>
          </div>
          <div className="flex gap-2">
            {categories.map((category, index) => (
              <button key={category} className={`rounded-full px-4 py-2 text-sm font-black ring-1 ${index === 0 ? "bg-[#ff5a00] text-white ring-[#ff5a00]" : "bg-white text-[#0b1220] ring-[#eee7dc]"}`}>{category}</button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-5">
          {products.map((product) => (
            <article key={product.name} className="rounded-[30px] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc]">
              <div className="grid h-40 place-items-center rounded-[26px] bg-gradient-to-br from-[#fffaf3] to-[#ede7dd] text-7xl shadow-inner">{product.image}</div>
              <h3 className="mt-5 min-h-14 text-xl font-black leading-tight tracking-tight">{product.name}</h3>
              <p className="mt-2 text-sm font-bold text-slate-500">{product.unit}</p>
              {approved ? (
                <p className="mt-4 text-2xl font-black text-[#ff5a00]">{product.price}</p>
              ) : (
                <p className="mt-4 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Gia si sau duyet</p>
              )}
              <div className="mt-5 flex gap-2">
                <button className="flex-1 rounded-2xl bg-[#fbfaf7] px-4 py-3 text-sm font-black ring-1 ring-[#eee7dc]">Chi tiet</button>
                <Link href="/sign-up" className="rounded-2xl bg-[#0b1220] px-4 py-3 text-sm font-black text-white">Mo gia</Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
