"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { updateMemberPermissions } from "@/lib/organizations/actions";
import type { TabKey } from "@/lib/permissions/tabs";
import type { TabAccess } from "@/types/database";
import { Button } from "@/components/ui/button";
import { PermissionMatrix } from "@/components/organizations/PermissionMatrix";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function MemberPermissionsButton({
  organizationId,
  memberId,
  memberName,
  initialPermissions,
}: {
  organizationId: string;
  memberId: string;
  memberName: string;
  initialPermissions: Record<TabKey, TabAccess>;
}) {
  const [open, setOpen] = useState(false);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await updateMemberPermissions(formData);
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPermissions(initialPermissions);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="ghost">
            <ShieldCheck className="size-3.5" />
            Permissions
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Permissions for {memberName}</DialogTitle>
          <DialogDescription>Choose what this person can view, edit, and delete.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="memberId" value={memberId} />
          <PermissionMatrix value={permissions} onChange={setPermissions} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
