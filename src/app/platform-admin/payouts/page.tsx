import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getSharedFundraiserLedger, getEventPayoutLedgerAdmin, getMembershipLedgerAdmin, type PendingPayoutRequest } from "@/lib/platform-admin/dal";
import { SHARED_SERVICE_FEE_RATE, sharedServiceFee } from "@/lib/finance/fees";
import { RecordPayoutDialog } from "@/components/platform-admin/RecordPayoutDialog";
import { RecordEventPayoutDialog } from "@/components/platform-admin/RecordEventPayoutDialog";
import { RecordMembershipPayoutDialog } from "@/components/platform-admin/RecordMembershipPayoutDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FEE_PERCENT = `${SHARED_SERVICE_FEE_RATE * 100}%`;

export const metadata: Metadata = {
  title: "Shared fundraiser payouts | KingdomFlow",
};

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Where to actually wire this request's money — read straight off the
// request's own snapshot (see PendingPayoutRequest), not the org's
// current saved profile, which may have changed since the request went in.
function formatPayoutDestination(request: PendingPayoutRequest): string | null {
  if (request.payoutMethod === "bank_transfer") {
    const last4 = (request.bankAccountNumber ?? "").slice(-4);
    return `Bank transfer — ${request.bankAccountHolder} · ...${last4} · IFSC ${request.bankIfsc} · ${request.bankName}`;
  }
  if (request.payoutMethod === "upi") {
    return `UPI — ${request.upiId}`;
  }
  return null;
}

export default async function PlatformAdminPayoutsPage() {
  await requirePlatformAdmin();
  const [ledger, eventLedger, membershipLedger] = await Promise.all([
    getSharedFundraiserLedger(),
    getEventPayoutLedgerAdmin(),
    getMembershipLedgerAdmin(),
  ]);

  return (
    <div className="max-w-4xl space-y-10">
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
                  {entry.pendingRequest && formatPayoutDestination(entry.pendingRequest) && (
                    <p className="mt-1 text-xs font-medium text-foreground">
                      Send via {formatPayoutDestination(entry.pendingRequest)}
                    </p>
                  )}
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

      <div>
        <h2 className="font-heading text-2xl font-bold tracking-tight">Event registration payouts</h2>
        <p className="mt-1 text-muted-foreground">
          Paid events using KingdomFlow&apos;s own payment gateway. Same {FEE_PERCENT} fee, same manual-wire model —
          record a payout here once it&apos;s done; the organizer gets a receipt email automatically.
        </p>
      </div>

      {eventLedger.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No platform-gateway events have collected anything yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {eventLedger.map((entry) => (
            <Card key={entry.eventId}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{entry.organizationName}</p>
                  <h3 className="font-heading text-base font-bold">{entry.eventTitle}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>₹{formatMoney(entry.collected)} collected</span>
                    <span>
                      {FEE_PERCENT} fee (₹{formatMoney(sharedServiceFee(entry.collected))})
                    </span>
                    <span>₹{formatMoney(entry.paidOut)} paid out</span>
                  </div>
                  {entry.pendingRequest && formatPayoutDestination(entry.pendingRequest) && (
                    <p className="mt-1 text-xs font-medium text-foreground">
                      Send via {formatPayoutDestination(entry.pendingRequest)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {entry.pendingRequest && <Badge variant="destructive">Payout requested</Badge>}
                  <Badge variant={entry.owed > 0 ? "default" : "secondary"}>₹{formatMoney(entry.owed)} owed</Badge>
                  <RecordEventPayoutDialog
                    eventId={entry.eventId}
                    organizationId={entry.organizationId}
                    eventTitle={entry.eventTitle}
                    owed={entry.pendingRequest?.amount ?? entry.owed}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">Membership fee payouts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly membership fees collected through the shared account, less the {FEE_PERCENT} fee, minus what&apos;s already been paid out.
          </p>
        </div>
        {membershipLedger.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">No membership fees have been collected yet.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {membershipLedger.map((entry) => (
              <Card key={entry.organizationId}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-heading text-base font-bold">{entry.organizationName}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>₹{formatMoney(entry.collected)} collected</span>
                      <span>
                        {FEE_PERCENT} fee (₹{formatMoney(sharedServiceFee(entry.collected))})
                      </span>
                      <span>₹{formatMoney(entry.paidOut)} paid out</span>
                    </div>
                    {entry.pendingRequest && formatPayoutDestination(entry.pendingRequest) && (
                      <p className="mt-1 text-xs font-medium text-foreground">Send via {formatPayoutDestination(entry.pendingRequest)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {entry.pendingRequest && <Badge variant="destructive">Payout requested</Badge>}
                    <Badge variant={entry.owed > 0 ? "default" : "secondary"}>₹{formatMoney(entry.owed)} owed</Badge>
                    <RecordMembershipPayoutDialog
                      organizationId={entry.organizationId}
                      organizationName={entry.organizationName}
                      owed={entry.pendingRequest?.amount ?? entry.owed}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
