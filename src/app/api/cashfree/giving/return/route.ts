import { NextResponse } from "next/server";
import { finalizeCashfreeGivingOrderPayment } from "@/lib/finance/cashfree-giving";
import { isGivingType } from "@/lib/finance/giving-types";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getSiteUrl } from "@/lib/site-url";

// Cashfree sends the browser here after checkout (GET). Success is confirmed
// with Cashfree directly, never taken from this request, then the person is
// sent back to the giving page they started from.
export async function GET(request: Request) {
  const siteUrl = getSiteUrl();
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const orderId = url.searchParams.get("order_id");
  if (!token || !orderId) return NextResponse.redirect(`${siteUrl}/`, { status: 303 });

  const isChurch = url.searchParams.get("scope") === "church";
  const typeParam = url.searchParams.get("type");
  const basePath = isChurch ? `/give/church/${token}` : `/give/${token}`;
  const typeQuery = isChurch && typeParam && isGivingType(typeParam) ? `&type=${typeParam}` : "";
  const giveUrl = (status: string, extra?: string) =>
    NextResponse.redirect(`${siteUrl}${basePath}?payment=${status}${typeQuery}${extra ? `&${extra}` : ""}`, { status: 303 });

  const result = await finalizeCashfreeGivingOrderPayment(orderId);
  if (result.error) {
    await logPlatformEvent({
      level: "warning",
      source: "fundraiser_giving",
      message: `Cashfree giving return not finalized: ${result.error}`,
      metadata: { orderId, token },
    });
    return giveUrl("failed", "reason=declined");
  }
  return giveUrl("success");
}
