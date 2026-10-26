import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectorScreen } from "@/components/projection/ProjectorScreen";
import { screenByToken } from "@/lib/projection/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projector", robots: { index: false, follow: false } };

// A church's projector screen: open it full-screen on the screen in the hall, or add it to OBS as a browser source
// (add ?bg=transparent to lay it over video, ?bg=green for a chroma key). What shows is chosen from the Live stream
// page's Verse projection console.
export default async function ProjectorPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ bg?: string }> }) {
  const { token } = await params;
  const { bg } = await searchParams;
  if (!(await screenByToken(token))) notFound();
  return <ProjectorScreen token={token} transparent={bg === "transparent"} chroma={bg === "green"} />;
}
