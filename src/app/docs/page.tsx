import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/LandingShell";
import { DocumentationBrowser } from "@/components/docs/DocumentationBrowser";

export const metadata: Metadata = {
  title: "Documentation | KingdomFlow",
  description: "How-to guides for every part of KingdomFlow, open to everyone, no sign-in needed.",
};

// The same guides as the dashboard's Documentation tab, for people who are not signed in (a church deciding on
// KingdomFlow, or someone locked out of their account).
export default function PublicDocumentationPage() {
  return (
    <LandingShell>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <DocumentationBrowser
          tagline="Built for the churches, by the church."
          emptyStateTemplate='No articles match "{query}". Try a different search, or write to us from the Contact page.'
        />
      </main>
    </LandingShell>
  );
}
