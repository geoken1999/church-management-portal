"use client";

import dynamic from "next/dynamic";

// VideoSDK's SDK touches WebRTC/media browser APIs that don't exist
// server-side — loaded client-only rather than risking an SSR crash.
// `ssr: false` is only valid from inside a Client Component, hence this
// tiny wrapper around the dynamic import.
export const KmeetCall = dynamic(() => import("@/components/kmeet/KmeetCall").then((mod) => mod.KmeetCall), { ssr: false });
