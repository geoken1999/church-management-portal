import { Card, CardContent } from "@/components/ui/card";

// Shown to members who can view a social page but can't change its connection.
// The account is linked for the church, so it's presented as linked, not as
// "not connected", with a note on who can change it.
export function LinkedAccountCard({ platformLabel, accountName, pictureUrl }: { platformLabel: string; accountName: string; pictureUrl: string | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        {pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pictureUrl} alt="" className="size-12 rounded-full object-cover" />
        ) : null}
        <div>
          <h3 className="font-heading text-base font-bold">{platformLabel} is connected</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Linked account: <span className="font-medium text-foreground">{accountName}</span>. Only an owner or admin can change or disconnect it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
