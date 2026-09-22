import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { getForm, getFormResponses } from "@/lib/forms/dal";
import { getSiteUrl } from "@/lib/site-url";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export async function generateMetadata({ params }: { params: Promise<{ formId: string }> }): Promise<Metadata> {
  const { formId } = await params;
  const form = await getForm(formId);
  return { title: form ? `${form.title} | KingdomFlow` : "Form | KingdomFlow" };
}

export default async function FormBuilderPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const membership = await requireOrganization();

  if (!membership.tabAccess.forms.read) {
    return <AccessRestricted label="Forms" />;
  }

  const form = await getForm(formId);
  if (!form || form.organization_id !== membership.organization.id) {
    notFound();
  }

  const responses = await getFormResponses(formId);
  const siteUrl = getSiteUrl();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{form.title}</h1>
        <p className="mt-1 text-muted-foreground">Build the form and review responses.</p>
      </div>

      <FormBuilder
        form={form}
        responses={responses}
        siteUrl={siteUrl}
        canWrite={membership.tabAccess.forms.write}
        canDelete={membership.tabAccess.forms.delete}
      />
    </div>
  );
}
