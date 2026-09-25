import { NextResponse } from "next/server";

// Served at /widget/loader.js?token=<share_token> — a church pastes
// <script src=".../widget/loader.js?token=..." async></script> onto their
// own external website. This plain script (runs on THEIR page, so it must
// be dependency-free vanilla JS, not a bundled React component) creates a
// single fixed-position iframe pointing at our own /widget/[token] page
// and resizes it in response to postMessage events from inside — a
// cross-origin iframe can never overflow its own box, so growing a small
// bubble into a full panel has to happen from the parent side.
const LOADER_SCRIPT = `
(function () {
  var currentScript = document.currentScript;
  if (!currentScript || document.getElementById("kf-widget-frame")) return;

  var scriptUrl;
  try {
    scriptUrl = new URL(currentScript.src);
  } catch (e) {
    return;
  }
  var token = scriptUrl.searchParams.get("token");
  if (!token) return;

  var iframe = document.createElement("iframe");
  iframe.id = "kf-widget-frame";
  iframe.src = scriptUrl.origin + "/widget/" + encodeURIComponent(token);
  iframe.title = "Chat with us";
  iframe.setAttribute("aria-label", "Chat widget");
  iframe.style.position = "fixed";
  iframe.style.bottom = "20px";
  iframe.style.right = "20px";
  iframe.style.width = "76px";
  iframe.style.height = "76px";
  iframe.style.border = "0";
  iframe.style.background = "transparent";
  iframe.style.zIndex = "2147483000";
  iframe.style.colorScheme = "light";
  iframe.style.transition = "width 0.15s ease, height 0.15s ease";

  function onReady() {
    document.body.appendChild(iframe);
  }
  if (document.body) {
    onReady();
  } else {
    document.addEventListener("DOMContentLoaded", onReady);
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "kf-widget-resize" || event.source !== iframe.contentWindow) return;

    if (data.position === "bottom-left") {
      iframe.style.left = "20px";
      iframe.style.right = "auto";
    } else {
      iframe.style.right = "20px";
      iframe.style.left = "auto";
    }
    if (typeof data.width === "number") iframe.style.width = data.width + "px";
    if (typeof data.height === "number") iframe.style.height = data.height + "px";
  });
})();
`;

export async function GET() {
  return new NextResponse(LOADER_SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
