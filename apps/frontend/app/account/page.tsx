import { AccountClient } from "./account-client";

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8">
      <section className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-slate-950">Tài khoản</h1>
        <p className="mt-2 text-slate-600">Thông tin khách hàng, sales phụ trách và nút liên hệ sẽ nằm ở đây.</p>
        <AccountClient />
      </section>
    </main>
  );
}
