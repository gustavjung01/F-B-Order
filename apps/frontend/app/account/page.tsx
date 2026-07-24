import { SignedIn } from "@clerk/nextjs";
import { AccountOrderInsights } from "@/components/account/AccountOrderInsights";
import { BackendAccountStatus } from "@/components/account/BackendAccountStatus";
import { ClerkAccountPanel } from "@/components/auth/ClerkAccountPanel";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <ResponsivePageShell active="account" title="Tài khoản" subtitle="Trạng thái và lịch sử mua hàng">
      <div className="space-y-4">
        <ClerkAccountPanel />
        <SignedIn>
          <BackendAccountStatus />
          <AccountOrderInsights />
        </SignedIn>
      </div>
    </ResponsivePageShell>
  );
}
