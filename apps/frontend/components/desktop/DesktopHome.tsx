import Link from "next/link";
import { AccountAction } from "@/components/auth/AccountAction";
import { AuthControls } from "@/components/auth/AuthControls";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { getApprovalLabel, getApprovalTone, isApprovedCustomer, mockCustomer } from "@/lib/mockCustomer";

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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
          <Link href="/" className="flex items-center">
            <BrandLogo className="h-16 w-auto" />
          </Link>
          <nav className="flex gap-2 text-sm font-black text-slate-600">
            <Link href="/" className="rounded-full bg-white px-4 py-2 text-[#ff5a00]">San pham</Link>
            <Link href="/recipes" className="rounded-full px-4 py-2 hover:bg-white">Cong thuc</Link>
            <Link href="/cart" className="rounded-full px-4 py-2 hover:bg-white">Gio hang</Link>
            <Link href="/account" className="rounded-full px-4 py-2 hover:bg-white">Tai khoan</Link>
          </nav>
          <AuthControls />
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl grid-cols-[1.2fr_0.8fr] gap-8 px-8 py-10">
        <div className="rounded-[40px] bg-[#fff1d7] p-10 shadow-lg ring-1 ring-white">
          <span className={`inline-flex rounded-full px-4 py-2 text-sm font-black ring-1 ${getApprovalTone(mockCustomer.approvalStatus)}`}>{getApprovalLabel(mockCustomer.approvalStatus)}</span>
          <h1 className="mt-6 max-w-3xl text-6xl font-black leading-none tracking-[-0.055em]">Nguon hang F&B cho quan tra sua, mi cay va topping.</h1>
          <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-slate-700">Khach xem catalog tu do. Dang nhap bang popup Clerk, gui ho so quan, admin duyet moi mo gia si.</p>
          <div className="mt-8 flex gap-3">
            <AccountAction href="/register" signedOutLabel="Dang nhap" className="rounded-2xl bg-[#ff5a00] px-6 py-4 font-black text-white">Ho so quan</AccountAction>
            <Link href="/recipes" className="rounded-2xl bg-white px-6 py-4 font-black ring-1 ring-[#eee7dc]">Xem cong thuc</Link>
          </div>
        </div>

        <aside className="rounded-[34px] bg-white p-6 shadow-lg ring-1 ring-[#efe7dc]">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#08775f]">Quy trinh</p>
          {['Xem catalog', 'Dang nhap popup', 'Gui ho so quan', 'Admin mo gia'].map((item, index) => (
            <div key={item} className="mt-3 flex items-center gap-3 rounded-2xl bg-[#fbfaf7] p-3 ring-1 ring-[#eee7dc]">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#08775f] text-sm font-black text-white">{index + 1}</span>
              <span className="font-black">{item}</span>
            </div>
          ))}
        </aside>
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-14">
        <h2 className="text-4xl font-black">San pham noi bat</h2>
        <div className="mt-6 grid grid-cols-4 gap-5">
          {products.map((product) => (
            <article key={product.name} className="rounded-[30px] bg-white p-5 shadow-lg ring-1 ring-[#efe7dc]">
              <div className="grid h-40 place-items-center rounded-[26px] bg-[#fff3ea] text-7xl">{product.image}</div>
              <h3 className="mt-5 min-h-14 text-xl font-black leading-tight">{product.name}</h3>
              <p className="mt-2 text-sm font-bold text-slate-500">{product.unit}</p>
              {approved ? <p className="mt-4 text-2xl font-black text-[#ff5a00]">{product.price}</p> : <p className="mt-4 inline-flex rounded-full bg-[#fff3ea] px-3 py-2 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Gia si sau duyet</p>}
              <div className="mt-5 flex gap-2">
                <button className="flex-1 rounded-2xl bg-[#fbfaf7] px-4 py-3 text-sm font-black ring-1 ring-[#eee7dc]">Chi tiet</button>
                <AccountAction href="/register" signedOutLabel="Mo gia" className="rounded-2xl bg-[#0b1220] px-4 py-3 text-sm font-black text-white">Mo gia</AccountAction>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
