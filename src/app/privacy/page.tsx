import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy | KingdomFlow",
  description: "How KingdomFlow collects, uses, and protects data for churches and their congregations.",
};

const LAST_UPDATED = "September 29, 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="Overview">
        <p>
          KingdomFlow (&ldquo;KingdomFlow,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) provides church management
          software used by religious organizations (&ldquo;Organizations&rdquo;) to manage members, events, giving,
          and communication. This policy explains what data we collect through our web application, mobile app, and
          public-facing pages (registration forms, join links, giving pages), why we collect it, who we share it
          with, and the choices available to you.
        </p>
        <p>
          <strong>Who controls what.</strong> When an Organization uses KingdomFlow to store information about its
          members, congregants, or event guests, that Organization is the <strong>data controller</strong> for that
          information and KingdomFlow acts as a <strong>data processor</strong> on its behalf. If you are a member or
          guest of a church using KingdomFlow and have questions about how your information is used, please contact
          that church directly; we process it only under their instructions and this policy.
        </p>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <p>
          <strong>Account holders (church staff and volunteers).</strong> Name, email address, phone number, and
          password (stored as a salted hash, never in plain text) when you or your Organization creates an account.
        </p>
        <p>
          <strong>Organization &amp; congregation data.</strong> Whatever your Organization enters or uploads to run
          the platform, which may include: member records (name, date of birth, marital status, contact details,
          custom fields your Organization configures), branch/location details, event details and registrations
          (including answers guests submit on public registration forms), attendance records, to-dos and plans,
          giving and offering records, forms and their submissions, and files uploaded to the platform (church logo,
          worship documents, images).
        </p>
        <p>
          <strong>Payment information.</strong> Subscription payments are processed by Razorpay. We do not store your
          card, UPI, or bank account details — Razorpay handles that and shares with us only what&apos;s needed to
          manage your subscription (plan, status, billing history).
        </p>
        <p>
          <strong>Communications sent through the platform.</strong> If your Organization sends email, SMS, or
          WhatsApp messages to its members through KingdomFlow, we process the message content and recipient details
          necessary to deliver it, and retain delivery status (sent, delivered, bounced) for troubleshooting.
        </p>
        <p>
          <strong>Usage &amp; device data.</strong> Log data (IP address, browser/device type, pages visited,
          timestamps) collected automatically when you use our web or mobile app, and — if you enable notifications
          in the mobile app — a device push-notification token used solely to deliver those notifications.
        </p>
        <p>
          <strong>Public forms &amp; pages.</strong> If you submit a public join request, event registration, form,
          or donation on behalf of an Organization using KingdomFlow, we collect the information you submit and pass
          it to that Organization.
        </p>
      </LegalSection>

      <LegalSection heading="How we use information">
        <ul>
          <li>To provide, maintain, and improve the platform and its features.</li>
          <li>To authenticate accounts and enforce the access permissions your Organization configures.</li>
          <li>To process subscription payments and manage billing, via Razorpay.</li>
          <li>To deliver emails, SMS, WhatsApp messages, and push notifications your Organization sends or that relate to your own account (password resets, billing receipts, service notices).</li>
          <li>To respond to support requests and communicate with you about the service.</li>
          <li>To detect, prevent, and address technical issues, fraud, or abuse.</li>
          <li>To comply with legal obligations.</li>
        </ul>
        <p>We do not sell personal information, and we do not use congregation data to serve third-party advertising.</p>
      </LegalSection>

      <LegalSection heading="Who we share information with">
        <p>We share information with the service providers that power KingdomFlow, each bound by their own data-protection obligations:</p>
        <ul>
          <li><strong>Supabase</strong> — database, authentication, and file storage infrastructure.</li>
          <li><strong>Vercel</strong> — application hosting.</li>
          <li><strong>Razorpay</strong> — subscription payment processing.</li>
          <li><strong>Resend</strong> — transactional and bulk email delivery.</li>
          <li><strong>Twilio</strong> — SMS and WhatsApp message delivery.</li>
          <li><strong>Firebase Cloud Messaging (Google)</strong> — push notifications to the KingdomFlow mobile app.</li>
        </ul>
        <p>
          If your Organization connects Instagram, YouTube, or Facebook from within KingdomFlow, content you choose
          to publish is shared with those platforms under their own terms — that connection is initiated and
          controlled by your Organization&apos;s admins.
        </p>
        <p>
          We may also disclose information if required by law, to protect the rights and safety of KingdomFlow, our
          users, or the public, or in connection with a merger, acquisition, or sale of assets (with notice to
          affected Organizations where required).
        </p>
      </LegalSection>

      <LegalSection heading="Data retention">
        <p>
          We retain Organization and congregation data for as long as the Organization&apos;s account is active, plus
          a reasonable period afterward to allow recovery of accidentally deleted data and to meet legal, accounting,
          or reporting obligations. An Organization&apos;s admins can delete individual records (members, events,
          files) at any time through the app. To request deletion of an entire Organization&apos;s account and data,
          contact us at{" "}
          <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a>.
        </p>
      </LegalSection>

      <LegalSection heading="Data security">
        <p>
          We use industry-standard safeguards to protect information, including encryption in transit (TLS),
          encryption at rest for stored data, row-level access controls so an Organization&apos;s data is isolated
          from every other Organization on the platform, and role-based permissions your admins configure for their
          own team. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights and choices">
        <p>Depending on your location and applicable law (including India&apos;s Digital Personal Data Protection Act), you may have the right to:</p>
        <ul>
          <li>Request access to, correction of, or deletion of your personal information.</li>
          <li>Withdraw consent for processing, where processing is based on consent.</li>
          <li>Object to or restrict certain processing.</li>
          <li>Request a copy of your data in a portable format.</li>
        </ul>
        <p>
          If you are a member or event guest of a church using KingdomFlow, please direct these requests to that
          church first, since they control your record. If you are an Organization account holder, contact us at{" "}
          <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a> and we will respond within a reasonable
          time.
        </p>
      </LegalSection>

      <LegalSection heading="Children's information">
        <p>
          KingdomFlow is intended for use by church staff, volunteers, and adult congregants. Organizations may store
          records for minors (e.g. youth ministry participants) as part of normal congregational record-keeping,
          entered and controlled by the Organization itself — KingdomFlow does not knowingly collect information
          directly from children through public-facing forms without an Organization&apos;s involvement.
        </p>
      </LegalSection>

      <LegalSection heading="International data transfers">
        <p>
          Our infrastructure providers may process and store data in regions outside your country. Where this
          occurs, we rely on our providers&apos; own security and compliance safeguards to protect your information
          consistent with this policy.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this policy from time to time. We&apos;ll update the &ldquo;Last updated&rdquo; date above,
          and for material changes we&apos;ll make reasonable efforts to notify Organization admins by email.
        </p>
      </LegalSection>

      <LegalSection heading="Contact us">
        <p>
          Questions about this policy or how your data is handled? Email us at{" "}
          <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
