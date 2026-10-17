import { NextResponse } from "next/server";
import { getUpdateConfig } from "@/lib/mobile/update-store";
import { answerFor } from "@/lib/mobile/update-config";

// The mobile app asks, before sign-in too, whether a newer version is out or its version is
// too old to keep running. Public: it only says which version is current and where the store
// listing is.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const platform = params.get("platform") === "ios" ? "ios" : "android";
  const version = (params.get("version") ?? "").trim();
  try {
    const config = await getUpdateConfig();
    return NextResponse.json(answerFor(config[platform], version), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Never block the app because this lookup failed.
    return NextResponse.json({
      status: "none",
      latest: "",
      storeUrl: "",
      notes: "",
    });
  }
}
