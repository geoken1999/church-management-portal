// Puts the real slide-drawing code on a page so a browser test can run it. Built by e2e/global-setup.ts.
import { init } from "pptx-preview";
import { drawPresentation } from "@/lib/projection/pptx-draw";

const w = window as unknown as { drawPresentation: typeof drawPresentation; pptxInit: typeof init };
w.drawPresentation = drawPresentation;
// The library on its own, for tests that look at what it makes of a file.
w.pptxInit = init;
