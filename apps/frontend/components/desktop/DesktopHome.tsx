import Link from "next/link";
import { AccountAction } from "@/components/auth/AccountAction";
import { AuthControls } from "@/components/auth/AuthControls";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { getApprovalLabel, getApprovalTone, isApprovedCustomer, mockCustomer } from "@/lib/mockCustomer";

const products = [
  { name: "Tran chau den 3Q", unit: "Goi 1kg", price: "42.000d", image: "B" },
  { name: "Bot sua Royal Auzan", unit: "Goi 1kg", price: "125.000d", image: "S" },
  { name: "Syrup Vani", unit: "Chai 750ml", price: "72.000d", image: "V" },
  { name: "Sua dac Ong Tho", unit: "Lon 380g", price: "28.000d", image: "O" },
];

export function DesktopHome() {
  const approved = isApprovedCustomer;

  return (
    <main className="min-h-screen bg-[#f7f3eb] text-[#0b1220]">
      <header className="sticky top-0 z-40 border-b border-[#eee7dc] bg-[#f7f3eb]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
          <Link href="/" className="flex items-center"><BrandLogo className="h-16 w-[260px]" /></Link>
          <nav className="flex gap-2 text-sm font-black text-slate-600">
            <Link href="/" className="rounded-full bg-white px-4 py-2 text-[#ff5a00]">San pham</Link>
            <Link href="/recipes" className="rounded-full px-4 py-2 hover:bg-white">Cong thuc</Link>
            <Link href="/cart" className="rounded-full px-4 py-2 hover:bg-white">Gio hang</Link>
            <Link href="/account" className="rounded-full px-4 py-2 hover:bg-white">Tai khoan</Link>
          </nav>
          <AuthControls />
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-8 py-10">
        <Link href="/" aria-label="San pham" className="home-card-image-products block min-h-[310px] rounded-[40px] bg-white bg-cover bg-center shadow-lg ring-1 ring-white" />
        <Link href="/recipes" aria-label="Cong thuc" className="home-card-image-recipes block min-h-[310px] rounded-[40px] bg-white bg-cover bg-center shadow-lg ring-1 ring-white" />
      </section>

      <section className="mx-auto max-w-7xl px-8 pb-14">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-4xl font-black">San pham noi bat</h2>
          <span className={`inline-flex rounded-full px-4 py-2 text-sm font-black ring-1 ${getApprovalTone(mockCustomer.approvalStatus)}`}>{getApprovalLabel(mockCustomer.approvalStatus)}</span>
        </div>
        <div className="grid grid-cols-4 gap-5">
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
