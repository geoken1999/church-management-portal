// Which of KingdomFlow's own payment gateways takes a one-time payment (a gift, a paid event, a membership fee, a
// course fee, an add-on pack), and which is tried if the first can't create the order. Pure, so the rules are
// testable.

export const PLATFORM_GATEWAYS = ["razorpay", "cashfree"] as const;
export type PlatformGateway = (typeof PLATFORM_GATEWAYS)[number];

export interface GatewayPolicy {
  /** The gateway tried first. */
  primary: PlatformGateway;
  /** When the primary can't create an order, retry on the other one (if it is configured). */
  failover: boolean;
}

export const DEFAULT_GATEWAY_POLICY: GatewayPolicy = { primary: "razorpay", failover: true };

export function isPlatformGateway(value: unknown): value is PlatformGateway {
  return typeof value === "string" && (PLATFORM_GATEWAYS as readonly string[]).includes(value);
}

export const otherGateway = (gateway: PlatformGateway): PlatformGateway => (gateway === "razorpay" ? "cashfree" : "razorpay");

/**
 * The gateways to try for a payment, in order. A gateway that isn't configured (no keys) is never tried. The second
 * one is only tried when failover is on. Empty means no gateway can take the payment.
 */
export function gatewayAttemptOrder(policy: GatewayPolicy, configured: Record<PlatformGateway, boolean>): PlatformGateway[] {
  const first = policy.primary;
  const second = otherGateway(first);
  const order: PlatformGateway[] = [];
  if (configured[first]) order.push(first);
  if (policy.failover && configured[second]) order.push(second);
  // The primary isn't set up but the other is: use it rather than refuse every payment.
  if (order.length === 0 && configured[second]) order.push(second);
  return order;
}
