import type { Metadata } from "next";
import {
  LegalPageLayout,
  LegalSection,
} from "@/components/legal/LegalPageLayout";
import { ConfirmDeletionButton } from "@/components/account-deletion/ConfirmDeletionButton";
import { checkDeletionToken } from "@/lib/account-deletion/form-actions";

export const metadata: Metadata = {
  title: "Confirm Account Deletion | KingdomFlow",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function ConfirmDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const state = await checkDeletionToken(token);

  return (
    <LegalPageLayout title="Confirm account deletion">
      {state === "valid" && (
        <LegalSection heading="Is this you?">
          <p>
            Confirm to send your deletion request to our team. Nothing is
            deleted until they review it, and you&apos;ll get an email when
            it&apos;s done.
          </p>
          <ConfirmDeletionButton token={token} />
        </LegalSection>
      )}
      {state === "done" && (
        <LegalSection heading="Already confirmed">
          <p>
            This request has already been confirmed. We&apos;ll email you when
            it&apos;s complete.
          </p>
        </LegalSection>
      )}
      {state === "invalid" && (
        <LegalSection heading="This link has expired">
          <p>
            The link isn&apos;t valid any more.{" "}
            <a href="/delete-account">Submit the form again</a> and we&apos;ll
            send a new one.
          </p>
        </LegalSection>
      )}
    </LegalPageLayout>
  );
}
