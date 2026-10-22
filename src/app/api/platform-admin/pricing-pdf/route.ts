import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/dal";
import { isPlatformAdminEmail } from "@/lib/platform-admin/auth-helpers";
import { getModulePricing } from "@/lib/onboarding/store";
import { renderPricingPdf } from "@/lib/onboarding/pricing-pdf";

export const dynamic = "force-dynamic";

// The price sheet (plans, module prices, custom-package block prices, add-on packs) as a PDF, for the platform
// admin only. Module prices are read live from Modules & pricing, so the sheet always matches the page.
export async function GET() {
  const user = await getAuthUser();
  if (!user || !isPlatformAdminEmail(user.email))
    return new NextResponse("Not found", { status: 404 });
  const pricing = await getModulePricing();
  const bytes = renderPricingPdf({
    modulePrices: Object.fromEntries(
      Object.entries(pricing).map(([key, value]) => [key, value.monthly_price]),
    ),
    generatedAt: new Date(),
  });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // Shown in the browser (not downloaded); the name is only what a "save" from the viewer would suggest.
      "Content-Disposition": 'inline; filename="kingdomflow-pricing.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
