import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getSharedFundraiserLedger } from "@/lib/platform-admin/dal";
import { SHARED_SERVICE_FEE_RATE, sharedServiceFee } from "@/lib/finance/fees";
import { RecordPayoutDialog } from "@/components/platform-admin/RecordPayoutDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FEE_PERCENT = `${SHARED_SERVICE_FEE_RATE * 100}%`;

export const metadata: Metadata = {
  title: "Shared fundraiser payouts | KingdomFlow",
};

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PlatformAdminPayoutsPage() {
  await requirePlatformAdmin();
  const ledger = await getSharedFundraiserLedger();

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Shared fundraiser payouts</h1>
        <p className="mt-1 text-muted-foreground">
          Fund Raisers using KingdomFlow&apos;s shared Razorpay account. Collected amounts sit in the platform&apos;s
          account, less a {FEE_PERCENT} transaction fee, until wired out manually — record a payout here once
          that&apos;s done.
        </p>
      </div>

      {ledger.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No shared-account fundraisers have collected anything yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ledger.map((entry) => (
            <Card key={entry.fundraiserId}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{entry.organizationName}</p>
                  <h3 className="font-heading text-base font-bold">{entry.fundraiserTitle}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>₹{formatMoney(entry.collected)} collected</span>
                    <span>
                      {FEE_PERCENT} fee (₹{formatMoney(sharedServiceFee(entry.collected))})
                    </span>
                    <span>₹{formatMoney(entry.paidOut)} paid out</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {entry.pendingRequest && <Badge variant="destructive">Payout requested</Badge>}
                  <Badge variant={entry.owed > 0 ? "default" : "secondary"}>₹{formatMoney(entry.owed)} owed</Badge>
                  <RecordPayoutDialog
                    fundraiserId={entry.fundraiserId}
                    organizationId={entry.organizationId}
                    fundraiserTitle={entry.fundraiserTitle}
                    owed={entry.pendingRequest?.amount ?? entry.owed}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
