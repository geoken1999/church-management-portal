import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout, LegalSection } from "@/components/legal/LegalPageLayout";

export const metadata: Metadata = {
  title: "Terms of Use | KingdomFlow",
  description: "The terms that govern use of KingdomFlow's church management platform.",
};

const LAST_UPDATED = "September 29, 2026";

export default function TermsOfUsePage() {
  return (
    <LegalPageLayout title="Terms of Use" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="Agreement to these terms">
        <p>
          These Terms of Use (&ldquo;Terms&rdquo;) govern your access to and use of KingdomFlow&apos;s website,
          web application, and mobile app (together, the &ldquo;Service&rdquo;), provided by KingdomFlow
          (&ldquo;KingdomFlow,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account, subscribing, or
          otherwise using the Service, you agree to these Terms on behalf of yourself and, if applicable, the
          Organization you represent. If you don&apos;t agree, don&apos;t use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="Who can use KingdomFlow">
        <p>
          The Service is intended for churches and religious organizations (&ldquo;Organizations&rdquo;) and the
          staff and volunteers they authorize (&ldquo;Users&rdquo;). You must be at least 18 years old and able to
          form a binding contract to create an account. The person who creates an Organization&apos;s account
          (the &ldquo;Owner&rdquo;) is responsible for that Organization&apos;s use of the Service, including the
          conduct of any admin or member accounts it invites.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts and access">
        <ul>
          <li>You&apos;re responsible for keeping your login credentials confidential and for all activity under your account.</li>
          <li>Organization Owners and admins control which staff/volunteer accounts exist within their Organization and what those accounts can access, using the permissions built into the Service.</li>
          <li>You must provide accurate information when creating an account and keep it up to date.</li>
          <li>Notify us immediately at <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a> if you suspect unauthorized use of your account.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Subscriptions, trials, and billing">
        <ul>
          <li>New Organizations get a free trial period; no payment is required to start.</li>
          <li>After the trial, continued access to paid features requires an active subscription, billed monthly or annually at the rates shown on our pricing page at the time of purchase.</li>
          <li>Subscription payments are processed by Razorpay. By subscribing, you also agree to Razorpay&apos;s applicable terms for payment processing.</li>
          <li>Subscriptions renew automatically at the end of each billing period unless cancelled beforehand from the Billing page.</li>
          <li>Fees are non-refundable except where required by law or expressly stated otherwise at the time of purchase.</li>
          <li>We may change our pricing or plan limits with reasonable advance notice; changes apply from your next billing cycle.</li>
          <li>Add-on packs (extra email/SMS/WhatsApp credits or storage) are one-time purchases and don&apos;t expire with the billing cycle, but are non-refundable once applied to your account.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Organization data and your responsibilities">
        <p>
          Everything an Organization enters into KingdomFlow — member records, event details, giving records,
          communications, files — belongs to that Organization. As between you and KingdomFlow, you retain all
          rights to your content; we don&apos;t claim ownership of it. By using the Service, you grant us a limited
          license to host, store, process, and transmit that content solely to provide the Service to you.
        </p>
        <p>You (and your Organization) are responsible for:</p>
        <ul>
          <li>Having a lawful basis to collect and store information about your members and congregants, and obtaining any consent required under applicable law.</li>
          <li>The accuracy of the data you enter and the content of any communications you send through the Service.</li>
          <li>Complying with anti-spam and data-protection laws when messaging your members via email, SMS, or WhatsApp.</li>
          <li>Managing who on your team has access to what, using the roles and permissions the Service provides.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose, or to harass, defraud, or harm others.</li>
          <li>Send unsolicited bulk messages unrelated to your Organization&apos;s legitimate communication with its own members.</li>
          <li>Attempt to gain unauthorized access to another Organization&apos;s data or to the Service&apos;s infrastructure.</li>
          <li>Reverse-engineer, scrape, or interfere with the Service&apos;s normal operation.</li>
          <li>Upload content that is unlawful, infringing, or that you don&apos;t have the right to upload.</li>
          <li>Resell or provide the Service to third parties outside your own Organization without our written consent.</li>
        </ul>
        <p>We may suspend or terminate accounts that violate this section.</p>
      </LegalSection>

      <LegalSection heading="Service availability">
        <p>
          We work to keep the Service reliable but don&apos;t guarantee uninterrupted or error-free operation. We may
          perform maintenance, and features may change, be added, or be removed over time. We&apos;ll provide notice
          of material changes where reasonably practical.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>
          The Service integrates with third-party providers (Razorpay, Resend, Twilio, Firebase, and — if you
          connect them — Instagram, YouTube, and Facebook). Your use of those integrations is also subject to the
          relevant provider&apos;s own terms, and we&apos;re not responsible for their acts or omissions.
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          KingdomFlow and its logos, branding, and software are owned by us or our licensors and protected by
          intellectual property law. These Terms don&apos;t grant you any rights to our trademarks or branding
          beyond what&apos;s needed to use the Service as intended.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may cancel your subscription and stop using the Service at any time from the Billing page. We may
          suspend or terminate your access if you materially breach these Terms, including for non-payment or
          violation of the Acceptable Use section, generally after notice and an opportunity to cure where
          practical. Upon termination, your right to use the Service ends; we handle your data as described in our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimers">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind,
          express or implied, including implied warranties of merchantability, fitness for a particular purpose, and
          non-infringement, to the fullest extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, KingdomFlow will not be liable for any indirect, incidental,
          special, consequential, or punitive damages, or any loss of data, revenue, or profits, arising from your
          use of the Service. Our total liability for any claim relating to the Service is limited to the amount you
          paid us in the 12 months before the claim arose.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          These Terms are governed by the laws of India, without regard to conflict-of-law principles. Any dispute
          arising from these Terms or the Service will be subject to the exclusive jurisdiction of the courts of
          India.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these Terms from time to time. We&apos;ll update the &ldquo;Last updated&rdquo; date above,
          and for material changes we&apos;ll make reasonable efforts to notify Organization admins by email.
          Continued use of the Service after changes take effect means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact us">
        <p>
          Questions about these Terms? Email us at <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
