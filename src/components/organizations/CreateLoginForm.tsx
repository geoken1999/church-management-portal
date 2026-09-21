"use client";

import { useState, useTransition } from "react";
import { UserPlus, Copy, Check } from "lucide-react";
import { createMemberLogin, type CreateLoginState } from "@/lib/organizations/actions";
import { defaultMemberTabPermissions, type TabKey } from "@/lib/permissions/tabs";
import type { TabAccess } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const initialState: CreateLoginState = {};

export function CreateLoginForm({
  organizationId,
  seatsRemaining,
}: {
  organizationId: string;
  seatsRemaining: number;
}) {
  const [state, setState] = useState<CreateLoginState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"admin" | "member">("member");
  const [permissions, setPermissions] = useState<Record<TabKey, TabAccess>>(defaultMemberTabPermissions());
  const [copied, setCopied] = useState(false);
  const seatsExhausted = seatsRemaining <= 0;

  function reset() {
    setState(initialState);
    setRole("member");
    setPermissions(defaultMemberTabPermissions());
    setCopied(false);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createMemberLogin(state, formData);
      setState(result);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="outline" disabled={seatsExhausted}>
            <UserPlus className="size-4" />
            {seatsExhausted ? "No seats left" : "Create login"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a login</DialogTitle>
          <DialogDescription>
            Issue a ready-to-use email and password for someone who won&apos;t sign up themselves — you&apos;ll
            share these credentials with them directly.
          </DialogDescription>
        </DialogHeader>

        {state.success && state.email && state.password ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                <p className="mb-2">
                  Login created. This password is shown only once — copy it now and share it with{" "}
                  {state.email}.
                </p>
                <div className="space-y-2">
                  <code className="block truncate rounded bg-muted px-2 py-1 text-xs">{state.email}</code>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{state.password}</code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`Email: ${state.email}\nPassword: ${state.password}`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="role" value={role} />
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" name="firstName" aria-invalid={Boolean(state.fieldErrors?.firstName)} />
                <FieldError id="firstName-error" message={state.fieldErrors?.firstName} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" name="lastName" aria-invalid={Boolean(state.fieldErrors?.lastName)} />
                <FieldError id="lastName-error" message={state.fieldErrors?.lastName} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" aria-invalid={Boolean(state.fieldErrors?.email)} />
              <FieldError id="email-error" message={state.fieldErrors?.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" name="phone" aria-invalid={Boolean(state.fieldErrors?.phone)} />
              <FieldError id="phone-error" message={state.fieldErrors?.phone} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v === "admin" ? "admin" : "member")}>
                <SelectTrigger id="role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {role === "admin"
                  ? "Admins have full access to every tab."
                  : "Set exactly what this person can view, edit, and delete below."}
              </p>
            </div>

            {role === "member" && <PermissionMatrix value={permissions} onChange={setPermissions} />}

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating..." : "Create login"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
