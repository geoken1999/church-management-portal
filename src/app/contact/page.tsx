import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal/LegalPageLayout";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact Us | KingdomFlow",
  description: "Get in touch with the KingdomFlow team.",
};

export default function ContactPage() {
  return (
    <LegalPageLayout title="Contact Us">
      <LegalSection heading="Get in touch">
        <p>
          Questions about KingdomFlow, need help with your account, or thinking about bringing your church onto the
          platform? Send us a message below, or email us directly at{" "}
          <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a>. We read every message and reply as soon as
          we can.
        </p>
      </LegalSection>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <ContactForm />
      </div>
    </LegalPageLayout>
  );
}
