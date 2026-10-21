"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  archiveGroupAction,
  updateGroupAction,
  type WebParticipant,
} from "@/lib/group-chat/actions";
import { GroupChat } from "@/components/group-chat/GroupChat";
import {
  GroupPeople,
  type MemberChoice,
  type TeamChoice,
} from "@/components/group-chat/GroupPeople";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@/components/ui/tabs";

export function GroupView({
  organizationId,
  group,
  participants,
  members,
  team,
  canWrite,
  canDelete,
  selfAuthUserId,
}: {
  organizationId: string;
  group: { id: string; name: string; description: string | null };
  participants: WebParticipant[];
  members: MemberChoice[];
  team: TeamChoice[];
  canWrite: boolean;
  canDelete: boolean;
  selfAuthUserId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateGroupAction(
        organizationId,
        group.id,
        name,
        description,
      ).catch(() => ({ error: "Something went wrong." }) as { error?: string });
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function archive() {
    if (
      !window.confirm(
        "Archive this group? It disappears for everyone, including its chat. Nothing is deleted.",
      )
    )
      return;
    startTransition(async () => {
      const result = await archiveGroupAction(organizationId, group.id).catch(
        () => ({ error: "Something went wrong." }) as { error?: string },
      );
      if (result.error) setError(result.error);
      else router.push("/dashboard/groups");
    });
  }

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      {editing ? (
        <div className="max-w-xl space-y-2">
          <Input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            aria-label="Group name"
          />
          <Textarea
            value={description}
            maxLength={500}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Description"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={save}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {group.name}
            </h1>
            {group.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {group.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {canWrite && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3.5" /> Edit
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={archive}
              >
                Archive
              </Button>
            )}
          </div>
        </div>
      )}

      <Tabs defaultValue="chat">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="chat">Chat</TabsTab>
          <TabsTab value="people">People ({participants.length})</TabsTab>
        </TabsList>
        <TabsPanel value="chat">
          <GroupChat
            organizationId={organizationId}
            groupId={group.id}
            participants={participants}
            canWrite={canWrite}
            canDelete={canDelete}
            selfAuthUserId={selfAuthUserId}
          />
        </TabsPanel>
        <TabsPanel value="people">
          <GroupPeople
            organizationId={organizationId}
            groupId={group.id}
            participants={participants}
            members={members}
            team={team}
            canWrite={canWrite}
          />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
