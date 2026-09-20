import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "SMS | KingdomFlow",
};

export default async function SmsPage() {
  await requireOrganization();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">SMS</h1>
        <p className="mt-1 text-muted-foreground">Text message announcements and reminders to your congregation.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <MessageSquareText className="size-8 text-muted-foreground" />
          <div>
            <h3 className="font-heading text-base font-bold">Coming soon</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              SMS integration is being planned — details on the provider and feature set are still being worked out.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
