import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function InstagramDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <Card size="lg">
        <CardHeader>
          <CardTitle className="text-xl">Data deletion complete</CardTitle>
          <CardDescription>
            Your Instagram connection and any associated data have been removed from KingdomFlow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {code && <p className="text-sm text-muted-foreground">Confirmation code: {code}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
