"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction, type LmsResult } from "@/lib/lms/actions";
import type { LmsSettings } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/auth/FieldError";
import { ErrorToast } from "@/components/ui/error-toast";

export function SettingsForm({
  organizationId,
  settings,
}: {
  organizationId: string;
  settings: LmsSettings;
}) {
  const [form, setForm] = useState({
    schoolName: settings.school_name,
    tagline: settings.tagline ?? "",
    defaultLanguage: settings.default_language,
    requireApproval: settings.enrollment_requires_approval,
    allowSelfEnrollment: settings.allow_self_enrollment,
    issueCertificates: settings.issue_certificates,
    signerName: settings.certificate_signer_name ?? "",
    signerTitle: settings.certificate_signer_title ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    setSaved(false);
    startTransition(async () => {
      const result = await saveSettingsAction(organizationId, form).catch(
        (): LmsResult => ({
          error: "Something went wrong. Check your connection and try again.",
        }),
      );
      if (result.error) setError(result.error);
      else if (result.fieldErrors) setErrors(result.fieldErrors);
      else setSaved(true);
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="max-w-xl space-y-4">
          <ErrorToast message={error} />
          <div className="space-y-1.5">
            <Label htmlFor="lms-name">School name</Label>
            <Input
              id="lms-name"
              value={form.schoolName}
              onChange={(e) =>
                setForm((f) => ({ ...f, schoolName: e.target.value }))
              }
              maxLength={120}
              placeholder="Grace Bible School"
            />
            <FieldError id="lms-name-error" message={errors.schoolName} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lms-tagline">Tagline (optional)</Label>
            <Input
              id="lms-tagline"
              value={form.tagline}
              onChange={(e) =>
                setForm((f) => ({ ...f, tagline: e.target.value }))
              }
              maxLength={200}
            />
            <FieldError id="lms-tagline-error" message={errors.tagline} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lms-language">Default course language</Label>
            <Input
              id="lms-language"
              value={form.defaultLanguage}
              onChange={(e) =>
                setForm((f) => ({ ...f, defaultLanguage: e.target.value }))
              }
              maxLength={10}
              className="max-w-32"
            />
            <FieldError
              id="lms-language-error"
              message={errors.defaultLanguage}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.requireApproval}
              onChange={(e) =>
                setForm((f) => ({ ...f, requireApproval: e.target.checked }))
              }
            />
            Enrollment requests wait for an administrator to approve them
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.allowSelfEnrollment}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  allowSelfEnrollment: e.target.checked,
                }))
              }
            />
            Members can ask to join a program themselves
          </label>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Certificates</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.issueCertificates}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    issueCertificates: e.target.checked,
                  }))
                }
              />
              Give a certificate when a student finishes a course or a program
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lms-signer-name">Signed by</Label>
                <Input
                  id="lms-signer-name"
                  value={form.signerName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, signerName: e.target.value }))
                  }
                  maxLength={120}
                  placeholder="Pastor John Mathew"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lms-signer-title">Their title</Label>
                <Input
                  id="lms-signer-title"
                  value={form.signerTitle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, signerTitle: e.target.value }))
                  }
                  maxLength={120}
                  placeholder="Senior Pastor"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Printed on every certificate under the school name.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save settings"}
            </Button>
            {saved && (
              <span className="text-sm text-muted-foreground">Saved.</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
