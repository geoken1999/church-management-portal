import Link from "next/link";
import { BookOpen } from "lucide-react";
import { NetworkCheck } from "@/components/livestream/NetworkCheck";
import { QUALITY_NEEDS } from "@/lib/livestream/netcheck";
import { ExternalLivePanel } from "@/components/livestream/ExternalLivePanel";
import type { ExternalPlatform } from "@/lib/livestream/external-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The default way to go live: from OBS straight to YouTube or Facebook, with their standard RTMP settings. Nothing here
// passes through KingdomFlow's video service, so it needs no setup and costs the church nothing extra.
const PLATFORMS = [
  { name: "YouTube", server: "rtmp://a.rtmp.youtube.com/live2", obsService: "YouTube - RTMPS", where: "YouTube Studio → Create → Go live → Stream, then copy the Stream key." },
  { name: "Facebook", server: "rtmps://live-api-s.facebook.com:443/rtmp/", obsService: "Facebook Live", where: "Facebook Live Producer → Streaming software, then copy the Stream key." },
];

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

export function LiveStreamInstructions({ canUseProjection, canWrite, active }: { canUseProjection: boolean; canWrite: boolean; active: { title: string; platform: ExternalPlatform; url: string } | null }) {
  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Your church can go live on YouTube and Facebook from OBS Studio (free, from obsproject.com) using their standard settings. Nothing passes through KingdomFlow, and viewers watch on YouTube or Facebook. Streaming inside the KingdomFlow app is set up separately, by request (see the In-app streaming tab).
      </p>

      <ExternalLivePanel active={active} canWrite={canWrite} />

      <Step title="1. Go live on YouTube or Facebook">
        <div className="grid gap-3 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <div key={p.name} className="space-y-1.5 rounded-lg border border-border p-3">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">Server address</p>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{p.server}</code>
              <p className="text-xs text-muted-foreground">
                Stream key: {p.where} Keep it private: anyone with it can stream to your channel.
              </p>
            </div>
          ))}
        </div>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            In OBS open <strong>Settings → Stream</strong>. Choose the platform as the <strong>Service</strong> (<strong>YouTube - RTMPS</strong> or <strong>Facebook Live</strong>) and paste the stream key. Or choose <strong>Custom</strong> and paste the server address above as well.
          </li>
          <li>
            Open <strong>Settings → Output</strong>, set Output Mode to <strong>Advanced</strong>, and on the Streaming tab use: Rate control <strong>CBR</strong>, Bitrate <strong>2500–4000 Kbps</strong> for 720p (up to about 6000 for 1080p on YouTube; Facebook asks for no more than about 4000), Keyframe interval <strong>2 s</strong>, and audio <strong>AAC at 128–160 Kbps</strong>.
          </li>
          <li>
            In <strong>Settings → Video</strong> choose <strong>1280×720</strong> at <strong>30 fps</strong> (1920×1080 only if your computer and internet can carry it).
          </li>
          <li>
            Add your sources (camera, microphone, slides), press <strong>Start Streaming</strong>, then press <strong>Go live</strong> on YouTube Studio or Facebook when it shows that it is receiving your video.
          </li>
          <li>
            Paste the stream&apos;s link in <strong>Tell your members you&apos;re live</strong> above, so members see it in the app. To finish, end the broadcast on YouTube or Facebook, press <strong>Stop Streaming</strong> in OBS, and remove the Live now card.
          </li>
        </ol>
      </Step>

      <Step title="2. Go live on both at the same time">
        <p>
          OBS has one main stream output. To send to YouTube and Facebook together, add a free plugin such as <strong>Multiple RTMP Outputs</strong> and give it each platform&apos;s server address and key. Sending twice uses roughly double your upload speed, so check your connection first (below).
        </p>
      </Step>

      <Step title="3. Show Bible verses and song words over your video">
        <p>
          Verse projection puts verses, song words, announcements and PowerPoint slides on a screen in your hall or over your video in OBS. In OBS add a <strong>Browser</strong> source with the <em>OBS browser source</em> link from the Verse projection page, sized to match your canvas, and choose Lower third or Full screen there.
        </p>
        {canUseProjection && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/livestream/projection" />}>
            <BookOpen className="size-4" />
            Open Verse projection
          </Button>
        )}
      </Step>

      <Step title="4. If OBS shows encoder errors or keeps reconnecting">
        <p>
          It means the computer cannot keep up with the video. In OBS open <strong>View → Docks → Stats</strong> and watch <strong>Skipped frames due to encoding lag</strong>: it should stay at 0%.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            On a Mac set the encoder to <strong>Apple VT H264 Hardware Encoder</strong>; on Windows use <strong>NVENC</strong> (NVIDIA) or <strong>QuickSync</strong> (Intel). Use Rate control CBR, Keyframe interval 2 s and a profile without B-frames (main or baseline).
          </li>
          <li>
            Remove sources you don&apos;t need. A full-screen capture is the heaviest; keep only the camera and the verse browser source if that is all you use.
          </li>
          <li>Close other programs, especially extra browser windows.</li>
          <li>Lower the output to 1280×720 at 30 fps and the bitrate to 2000–2500 Kbps.</li>
          <li>Use a wired network connection if you can; Wi-Fi drops cause reconnects.</li>
          <li>Don&apos;t change settings while streaming. Stop, adjust, then start again.</li>
        </ul>
      </Step>

      <NetworkCheck quality="med" description={`Run this on the computer you will stream from, at the venue, before you go live. 720p streaming needs about ${QUALITY_NEEDS.med.needMbps} Mbps of upload.`} />
    </div>
  );
}
