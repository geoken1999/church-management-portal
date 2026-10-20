import type { Metadata } from "next";
import {
  LegalPageLayout,
  LegalSection,
} from "@/components/legal/LegalPageLayout";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact Us | KingdomFlow",
  description: "Get in touch with the KingdomFlow team.",
};

// Links from the landing page can open the form already filled in for a topic.
const TOPICS: Record<string, { subject: string; message: string }> = {
  "branded-app": {
    subject: "Our church's own branded app",
    message:
      "We'd like the KingdomFlow app under our own church's name, logo and colours. Our church name is:\n\nTell us a little about your church (members, location) and the best time to reach you:\n",
  },
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  const preset = topic ? TOPICS[topic] : undefined;
  return (
    <LegalPageLayout title="Contact Us">
      <LegalSection heading="Get in touch">
        <p>
          Questions about KingdomFlow, need help with your account, or thinking
          about bringing your church onto the platform? Send us a message below,
          or email us directly at{" "}
          <a href="mailto:admin@kingdomflow.in">admin@kingdomflow.in</a>. We
          read every message and reply as soon as we can.
        </p>
      </LegalSection>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <ContactForm
          defaultSubject={preset?.subject}
          defaultMessage={preset?.message}
        />
      </div>
    </LegalPageLayout>
  );
}
