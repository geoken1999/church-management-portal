import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout, LegalSection } from "@/components/legal/LegalPageLayout";

export const metadata: Metadata = {
  title: "About Us | KingdomFlow",
  description: "What KingdomFlow is, who it's built for, and how to reach us.",
};

export default function AboutPage() {
  return (
    <LegalPageLayout title="About KingdomFlow">
      <LegalSection heading="What we do">
        <p>
          KingdomFlow is a connected platform for church management — one dashboard for a congregation roster,
          branches, events, attendance, giving, communication, and the public-facing pages a church shares with its
          own community, instead of a different disconnected tool for each. It&apos;s built for churches of any
          size, from a single congregation to a multi-branch organization spanning several locations.
        </p>
      </LegalSection>

      <LegalSection heading="Why we built it">
        <p>
          Church staff and volunteers are usually stretched across a spreadsheet for members, a separate tool for
          giving, another for email or WhatsApp campaigns, and a stack of paper forms for event sign-ups and new
          member registration. KingdomFlow exists to replace that patchwork with one place that already understands
          how a church actually operates — branches, leaders, families, ministries, offerings, and a congregation
          that grows over time — so a small team can run it without hiring a full-time administrator.
        </p>
      </LegalSection>

      <LegalSection heading="What's inside">
        <ul>
          <li><strong>People</strong> — members, leaders, youth, families, and team logins with per-tab permissions.</li>
          <li><strong>Ministry</strong> — branches, ministries, worship and media rosters, events with public registration and QR check-in, and attendance tracking.</li>
          <li><strong>Finance</strong> — offerings, donations, and fundraisers, with an optional online giving link powered by Razorpay.</li>
          <li><strong>Communication</strong> — email, SMS, and WhatsApp campaigns, plus a shareable Forms builder and an embeddable website widget.</li>
          <li><strong>Public pages</strong> — a join link, event registration, giving, and document-sharing pages a church can share directly with its own community, available in English, Tamil, and Hindi.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="How we think about your data">
        <p>
          A church&apos;s congregation data is sensitive, and it belongs to that church — not to us. Every
          Organization&apos;s data is isolated from every other Organization on the platform, and access within a
          church is controlled by the permissions its own admins configure for their team. See our{" "}
          <Link href="/privacy">Privacy Policy</Link> for the full detail.
        </p>
      </LegalSection>

      <LegalSection heading="Where we're based">
        <p>
          KingdomFlow is built in India, with churches across India as our first users — pricing in rupees, UPI and
          card payments through Razorpay, and phone-number formatting for Indian numbers built in from the start.
        </p>
      </LegalSection>

      <LegalSection heading="Get in touch">
        <p>
          Questions, feedback, or thinking about bringing your church onto KingdomFlow? Email us at{" "}
          <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a> — we read every message.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
