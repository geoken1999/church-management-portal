import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout, LegalSection } from "@/components/legal/LegalPageLayout";

export const metadata: Metadata = {
  title: "Refund Policy | KingdomFlow",
  description: "KingdomFlow's policy on subscription fees, cancellations, and refunds.",
};

const LAST_UPDATED = "October 1, 2026";

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout title="Refund Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="Overview">
        <p>
          This policy explains how refunds work for KingdomFlow subscriptions and add-on packs, and complements our{" "}
          <Link href="/terms">Terms of Use</Link>. It applies to payments made through KingdomFlow for its own
          subscription plans and add-on packs — not to any donations, offerings, or fundraiser payments an
          Organization collects from its own congregation through the platform, which are between that Organization
          and its donors.
        </p>
      </LegalSection>

      <LegalSection heading="Free trial">
        <p>
          Every new Organization gets a 14-day free trial with full Basic-plan access — no card required, and nothing
          is charged during the trial. There&apos;s nothing to refund until you actively choose to subscribe.
        </p>
      </LegalSection>

      <LegalSection heading="Subscription fees are generally non-refundable">
        <p>
          Once a billing period is charged — monthly or annual, at the rate shown at the time of purchase — that
          fee is non-refundable, including if you stop using the Service partway through the period. Cancelling a
          subscription takes effect immediately: it stops future billing, but it does not refund any amount already
          paid for the current period, and there is currently no prorated credit for early cancellation.
        </p>
        <p>
          We know an annual plan is a bigger commitment than a monthly one — if you&apos;re unsure which billing
          interval is right for your church, start on monthly and switch later rather than committing to annual
          upfront.
        </p>
      </LegalSection>

      <LegalSection heading="Add-on packs">
        <p>
          Add-on packs (extra email, SMS, or WhatsApp credits, or extra storage) are one-time purchases charged
          immediately. They don&apos;t expire with your billing cycle, but they are non-refundable once purchased and
          applied to your account.
        </p>
      </LegalSection>

      <LegalSection heading="When we do issue a refund">
        <p>We&apos;ll refund a payment, in whole or in part, when:</p>
        <ul>
          <li>You were charged in error — for example, a duplicate charge, or a charge after a subscription was already cancelled.</li>
          <li>A technical fault on our side caused an incorrect amount to be charged.</li>
          <li>A refund is required by applicable law.</li>
        </ul>
        <p>
          Outside of these cases, and except where we expressly state otherwise at the time of a specific purchase,
          fees already charged are not refunded.
        </p>
      </LegalSection>

      <LegalSection heading="Failed or pending payments">
        <p>
          If a payment fails or is left pending on Razorpay&apos;s side, you are not charged and your plan access is
          unaffected until a payment actually succeeds — there&apos;s nothing to refund in that case.
        </p>
      </LegalSection>

      <LegalSection heading="How to request a refund">
        <p>
          If you believe you were charged in error, email us at <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a>{" "}
          with your Organization&apos;s name and the payment reference from your Razorpay receipt. We aim to review
          and respond within 5 business days. Approved refunds are returned to the original payment method through
          Razorpay, and typically take 5–7 business days to reflect depending on your bank or card issuer.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this policy from time to time. We&apos;ll update the &ldquo;Last updated&rdquo; date above,
          and any change applies to payments made after it takes effect, not retroactively.
        </p>
      </LegalSection>

      <LegalSection heading="Contact us">
        <p>
          Questions about a charge or this policy? Email us at <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
