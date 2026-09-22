import "server-only";

import Razorpay from "razorpay";
import { getRazorpayEnv } from "@/lib/billing/env";

export function createRazorpayClient(): Razorpay {
  const { keyId, keySecret } = getRazorpayEnv();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export { Razorpay };
