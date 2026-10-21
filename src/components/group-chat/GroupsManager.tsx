"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare, Plus, Users } from "lucide-react";
import { createGroupAction } from "@/lib/group-chat/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface GroupListRow {
  id: string;
  name: string;
  description: string | null;
  people: number;
  lastMessageAt: string | null;
}

export function GroupsManager({
  organizationId,
  groups,
  canWrite,
}: {
  organizationId: string;
  groups: GroupListRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createGroupAction(
        organizationId,
        name,
        description,
      ).catch(
        () =>
          ({
            error: "Something went wrong. Check your connection and try again.",
          }) as { error?: string; id?: string },
      );
      if (result.error || !result.id) {
        setError(result.error ?? "Couldn't create the group.");
        return;
      }
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/dashboard/groups/${result.id}`);
    });
  }

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      {canWrite && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button type="button">
                <Plus className="size-4" /> New group
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New group</DialogTitle>
              <DialogDescription>
                Give the group a name. You add its people on the next screen.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="group-name">Name</Label>
                <Input
                  id="group-name"
                  value={name}
                  maxLength={80}
                  placeholder="Youth leaders"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-description">
                  Description (optional)
                </Label>
                <Textarea
                  id="group-description"
                  value={description}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                disabled={pending || name.trim().length < 2}
                onClick={create}
              >
                {pending ? "Creating..." : "Create group"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No groups yet.
            {canWrite ? ' Click "New group" to create the first one.' : ""}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Link key={g.id} href={`/dashboard/groups/${g.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessagesSquare className="size-4 text-primary" />
                    <p className="font-medium">{g.name}</p>
                  </div>
                  {g.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {g.description}
                    </p>
                  )}
                  <p className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="size-3" /> {g.people}{" "}
                      {g.people === 1 ? "person" : "people"}
                    </span>
                    <span>
                      {g.lastMessageAt
                        ? `Last message ${new Date(g.lastMessageAt).toLocaleDateString()}`
                        : "No messages yet"}
                    </span>
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
