import { Phone, Radio } from "lucide-react";
import { formatDataSize, formatDuration, getSessionUsage } from "@/lib/platform-admin/session-usage";
import { formatPlatformDateTime } from "@/lib/platform-admin/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-24">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Live streams and calls with what each one used: time in the room, viewers' watch time and the data they pulled.
export async function LiveSessionsUsage() {
  const rows = await getSessionUsage(40);
  const streams = rows.filter((r) => r.kind === "stream");
  const total = {
    participantSeconds: rows.reduce((sum, r) => sum + (r.participantSeconds ?? 0), 0),
    viewerSeconds: streams.reduce((sum, r) => sum + r.viewerSeconds, 0),
    egressMb: streams.reduce((sum, r) => sum + r.estimatedEgressMb, 0),
    broadcastSeconds: streams.reduce((sum, r) => sum + r.durationSeconds, 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent>
            <Metric label="Sessions" value={String(rows.length)} hint={`${streams.length} streams, ${rows.length - streams.length} calls`} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Metric label="Time in rooms" value={formatDuration(total.participantSeconds)} hint="Everyone added together" />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Metric label="Broadcast time" value={formatDuration(total.broadcastSeconds)} hint={`Viewers watched ${formatDuration(total.viewerSeconds)}`} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Metric label="Viewer data" value={formatDataSize(total.egressMb)} hint="Estimated, sent to viewers" />
          </CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No live streams or calls yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={`${row.kind}-${row.id}`}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {row.kind === "stream" ? <Radio className="size-4 text-muted-foreground" /> : <Phone className="size-4 text-muted-foreground" />}
                  <span className="font-medium">{row.title}</span>
                  <Badge variant="secondary">{row.organizationName}</Badge>
                  <Badge variant="outline">{row.mode}</Badge>
                  {row.status === "live" && <Badge variant="destructive">Live now</Badge>}
                  {row.obs && <Badge variant="outline">OBS</Badge>}
                  {row.recorded && <Badge variant="outline">Recorded</Badge>}
                  {row.restreams > 0 && <Badge variant="outline">{row.restreams} restream{row.restreams === 1 ? "" : "s"}</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <Metric label="Started" value={row.startedAt ? formatPlatformDateTime(row.startedAt) : "—"} />
                  <Metric label="Ran for" value={formatDuration(row.durationSeconds)} />
                  <Metric label="Time in room" value={row.participantSeconds !== null ? formatDuration(row.participantSeconds) : "—"} hint="All people added up" />
                  {row.kind === "stream" && (
                    <>
                      <Metric label="Peak viewers" value={String(row.peakViewers)} />
                      <Metric label="Watched" value={formatDuration(row.viewerSeconds)} hint="All viewers added up" />
                      <Metric label="Viewer data" value={formatDataSize(row.estimatedEgressMb)} hint={`Estimate, ${row.quality ?? ""} quality`} />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Time in room is the video service&apos;s own record of how long each person was connected. Watched time comes from the app&apos;s playback reports, and viewer data is estimated from it using the stream&apos;s quality, so treat it as a close guide, not an invoice. Calls are listed so you can see their room time too.
      </p>
    </div>
  );
}
