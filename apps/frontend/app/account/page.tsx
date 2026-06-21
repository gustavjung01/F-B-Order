import { SignedIn } from "@clerk/nextjs";
import { BackendAccountStatus } from "@/components/account/BackendAccountStatus";
import { ClerkAccountPanel } from "@/components/auth/ClerkAccountPanel";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <ResponsivePageShell active="account" title="Tài khoản" subtitle="Trạng thái do backend xác nhận">
      <div className="space-y-4">
        <ClerkAccountPanel />
        <SignedIn>
          <BackendAccountStatus />
        </SignedIn>
      </div>
    </ResponsivePageShell>
  );
}
