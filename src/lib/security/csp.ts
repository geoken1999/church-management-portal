// The content security policy, kept in a plain module so next.config.ts and the tests read the same thing.
//
// Every outside host here is one the app really uses: payments (Razorpay, Cashfree, PayU), calls and streaming
// (Zoom, VideoSDK), the WhatsApp sign-up window (Facebook), fonts, and the database. A host that is not listed is
// blocked, and the browser reports it to /api/csp-report (it shows in the Vercel logs as "[csp-report]").
//
// 'unsafe-inline' stays for scripts and styles: Next.js writes small inline scripts into every page and React
// sets style attributes, and neither can be allowed any other way without a per-request nonce.

const SCRIPT_HOSTS = [
  "https://sdk.cashfree.com",
  "https://*.cashfree.com",
  "https://checkout.razorpay.com",
  "https://source.zoom.us",
  "https://*.zoom.us",
  // The WhatsApp Business sign-up window loads Facebook's SDK.
  "https://connect.facebook.net",
];

const CONNECT_HOSTS = [
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.videosdk.live",
  "wss://*.videosdk.live",
  "https://*.razorpay.com",
  "https://*.cashfree.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://zoom.us",
  "https://*.zoom.us",
  "wss://*.zoom.us",
  "https://*.zoom.com",
  "wss://*.zoom.com",
  "https://*.zoomgov.com",
  "wss://*.zoomgov.com",
  // The Zoom meeting window also loads assets and talks to media gateways through these.
  "https://*.cloudfront.net",
  "https://*.facebook.com",
  "https://*.facebook.net",
];

const FRAME_HOSTS = [
  "https://*.zoom.us",
  "https://*.razorpay.com",
  "https://*.cashfree.com",
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://*.facebook.com",
];

export function contentSecurityPolicy({ framingAllowed = true }: { framingAllowed?: boolean } = {}): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${SCRIPT_HOSTS.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${CONNECT_HOSTS.join(" ")}`,
    // Zoom starts its audio, video and decoding workers from its own host as well as from blobs.
    "worker-src 'self' blob: https://source.zoom.us https://*.zoom.us",
    `frame-src ${FRAME_HOSTS.join(" ")}`,
    "form-action 'self' https://secure.payu.in https://test.payu.in",
    "base-uri 'self'",
    "object-src 'none'",
    "report-uri /api/csp-report",
  ];
  if (!framingAllowed) directives.push("frame-ancestors 'none'");
  return directives.join("; ");
}

/**
 * The header name. The policy is enforced unless CSP_MODE is "report-only", which turns it back into a
 * log-only policy (set it in Vercel and redeploy) if enforcing ever blocks something it should not.
 */
export function cspHeaderName(mode: string | undefined = process.env.CSP_MODE): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return mode?.trim().toLowerCase() === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}
