"use client";

import { useRef } from "react";
import { switchOrganization } from "@/lib/organizations/actions";
import type { OrganizationMembership } from "@/lib/organizations/dal";

export function OrgSwitcher({
  memberships,
  activeOrganizationId,
}: {
  memberships: OrganizationMembership[];
  activeOrganizationId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (memberships.length <= 1) {
    return (
      <span className="block truncate text-sm font-medium" title={memberships[0]?.organization.name}>
        {memberships[0]?.organization.name}
      </span>
    );
  }

  return (
    <form ref={formRef} action={switchOrganization} className="min-w-0">
      <select
        name="organizationId"
        defaultValue={activeOrganizationId}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="Switch organization"
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {memberships.map(({ organization }) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </form>
  );
}
