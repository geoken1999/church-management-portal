"use client";

import { useActionState, useState } from "react";
import { Church, Users, MapPin, UserRound } from "lucide-react";
import { createOrganization, type CreateOrganizationState } from "@/lib/organizations/actions";
import { slugify, MEMBER_COUNT_OPTIONS, CHURCH_ROLE_OPTIONS } from "@/lib/organizations/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: CreateOrganizationState = {};

export function CreateOrganizationForm() {
  const [state, formAction, pending] = useActionState(createOrganization, initialState);
  const [name, setName] = useState("");
  const [memberCountRange, setMemberCountRange] = useState("");
  const [role, setRole] = useState("");
  const errors = state.fieldErrors;

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="name" className="gap-1.5">
          <Church className="size-4 text-primary" />
          Church name
        </Label>
        <Input
          id="name"
          name="name"
          placeholder="Grace Community Church"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="organization"
          aria-invalid={Boolean(errors?.name)}
          aria-describedby={errors?.name ? "name-error" : undefined}
        />
        {name.trim().length >= 2 && (
          <p className="text-xs text-muted-foreground">
            Workspace ID: {slugify(name) || "your-church"}
          </p>
        )}
        <FieldError id="name-error" message={errors?.name} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="memberCountRange" className="gap-1.5">
          <Users className="size-4 text-primary" />
          How many members does your church have?
        </Label>
        <input type="hidden" name="memberCountRange" value={memberCountRange} />
        <Select value={memberCountRange} onValueChange={(value) => setMemberCountRange(value ?? "")}>
          <SelectTrigger id="memberCountRange" className="w-full" aria-invalid={Boolean(errors?.memberCountRange)}>
            <SelectValue placeholder="Select a range">
              {(value: string | null) =>
                MEMBER_COUNT_OPTIONS.find((o) => o.value === value)?.label ?? "Select a range"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MEMBER_COUNT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="memberCountRange-error" message={errors?.memberCountRange} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="branchCount" className="gap-1.5">
          <MapPin className="size-4 text-primary" />
          How many locations/branches do you have?
        </Label>
        <Input
          id="branchCount"
          name="branchCount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          placeholder="e.g. 1"
          required
          aria-invalid={Boolean(errors?.branchCount)}
          aria-describedby={errors?.branchCount ? "branchCount-error" : undefined}
        />
        <FieldError id="branchCount-error" message={errors?.branchCount} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="role" className="gap-1.5">
          <UserRound className="size-4 text-primary" />
          Your role at the church
        </Label>
        <input type="hidden" name="role" value={role} />
        <Select value={role} onValueChange={(value) => setRole(value ?? "")}>
          <SelectTrigger id="role" className="w-full" aria-invalid={Boolean(errors?.role)}>
            <SelectValue placeholder="Select your role" />
          </SelectTrigger>
          <SelectContent>
            {CHURCH_ROLE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {role === "Other" && (
          <Input
            name="roleOther"
            placeholder="Enter your role"
            required
            className="mt-2"
            aria-label="Your role"
          />
        )}
        <FieldError id="role-error" message={errors?.role} />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating organization..." : "Create organization"}
      </Button>
    </form>
  );
}
