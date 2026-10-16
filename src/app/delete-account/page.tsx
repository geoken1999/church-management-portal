import type { Metadata } from "next";
import {
  LegalPageLayout,
  LegalSection,
} from "@/components/legal/LegalPageLayout";
import { DeletionRequestForm } from "@/components/account-deletion/DeletionRequestForm";

export const metadata: Metadata = {
  title: "Delete Your Account | KingdomFlow",
  description:
    "Ask KingdomFlow to delete your account and personal data, even if you can no longer use the app.",
};

export default function DeleteAccountPage() {
  return (
    <LegalPageLayout title="Delete your account">
      <LegalSection heading="Can still open the app?">
        <p>
          The quickest way is inside the KingdomFlow mobile app: open{" "}
          <strong>Profile</strong> and choose <strong>Delete account</strong>.
          Your church&apos;s admin then processes it.
        </p>
      </LegalSection>

      <LegalSection heading="Can't use the app?">
        <p>
          If you lost your phone, can&apos;t sign in, or only ever filled in a
          church&apos;s form or event registration, use the form below.
          We&apos;ll email you a link to confirm it&apos;s really you, then our
          team reviews your request and writes back when it&apos;s done.
        </p>
        <p>
          <strong>What happens:</strong> your sign-in is deleted. If you chose
          to, we also ask the church that holds your member record to delete it,
          since the church controls that information. We keep only what the law
          requires, such as tax invoices and payment records. See the{" "}
          <a href="/privacy">Privacy Policy</a> for details.
        </p>
      </LegalSection>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <DeletionRequestForm />
      </div>
    </LegalPageLayout>
  );
}
