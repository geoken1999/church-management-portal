import "server-only";

import { generateVisionJsonCompletion } from "@/lib/ai/openai";
import { FONTS } from "./model";
import { ICONS } from "./icons";
import { buildDocFromAi, type AiLayout } from "./ai-layout";

export interface AiImageInput {
  /** "image1", "image2", … or "logo" */
  ref: string;
  /** What the person calls it, if anything (the file name). */
  label: string;
  width: number;
  height: number;
  /** A small JPEG data URL, or the logo's https address. */
  preview: string;
}

const fontGuide = Object.entries(FONTS)
  .map(([key, font]) => `${key} (${font.label})`)
  .join(", ");
const iconGuide = Object.entries(ICONS)
  .map(([key, icon]) => `${key} (${icon.label})`)
  .join(", ");

function systemPrompt(): string {
  return [
    "You are a graphic designer making a flyer or poster for a church. You choose the content, colours and style; a layout program places everything, so never give coordinates or pixel sizes. Answer with one JSON object and nothing else.",
    'Shape: {"name": string (a short title, max 6 words, no year), "background": {"type":"solid"|"gradient","color":"#rrggbb","color2":"#rrggbb","angle":number}, "align":"center"|"left", "accents": [...], "blocks": [...]}. Every colour is a six-digit hex like #1f2a44.',
    "blocks are the content, in reading order from top to bottom:",
    '- text: {"type":"text","text":string,"size":"xl"|"l"|"m"|"s","fontFamily":key,"fontWeight":400|700|900,"italic":bool,"uppercase":bool,"letterSpacing":0-12,"color":"#hex"}. Use \n for a line break. "xl" is for the main headline, "l" for a subtitle or key detail such as the date, "m" for ordinary lines, "s" for fine print.',
    '- image: {"type":"image","image":"image1","size":"xl"|"l"|"m"|"s","shape":"rect"|"rounded"|"circle"}. Places one attached picture (see the request for their names). Use it as a main feature of the design.',
    '- icon: {"type":"icon","icon":key,"size":"xl"|"l"|"m"|"s","color":"#hex"} for a small symbol above or between text.',
    '- divider: {"type":"divider","color":"#hex"} a short accent line between groups of text.',
    'accents are decoration behind the content (0 to 3 of them): {"kind":"frame"|"band_top"|"band_bottom"|"circle_top_right"|"circle_bottom_left"|"corner_icons","color":"#hex","opacity":0.1-1,"icon":key (only for corner_icons)}.',
    `fontFamily is one of: ${fontGuide}. icon is one of: ${iconGuide}.`,
    "Design rules: 4 to 9 blocks. Start with the headline (short, ideally under 5 words, large) and use at most two font families. Put each important detail (date, time, place) in its own short text block so it is easy to read. Choose 2 or 3 harmonious colours; text must contrast strongly with the background (light text on dark backgrounds, dark text on light ones). Match the mood the person describes (for example elegant, joyful, youthful, solemn).",
    "Facts: use only what the person gave you. Never invent or add a year, date, time, address, phone number, name, website or price. If a detail they did not provide would normally appear, leave it out, or use a short neutral line such as \"All are welcome\". You may use the church name. Write in the language the person used.",
    "Pictures: only use images that are listed in the request, by their exact names. If none are listed, do not use image blocks. A picture named \"logo\" is the church logo: use it once, small (size \"s\"), near the top or the bottom. For a group photo or another main picture use size \"l\" or \"xl\" and keep text blocks short so there is room.",
  ].join("\n");
}

/**
 * Asks the AI to lay out a design for a request. It sees the request and small previews of any pictures the person
 * attached, never the full-size pictures; those are placed into the layout later, in the person's browser.
 */
export async function generateDesignLayout(params: { prompt: string; width: number; height: number; churchName: string; images: AiImageInput[] }): Promise<AiLayout | { error: string }> {
  const { prompt, width, height, churchName, images } = params;
  const imageLines = images.map((img) => `- "${img.ref}": ${img.ref === "logo" ? "the church's logo" : `a picture${img.label ? ` called "${img.label}"` : ""}`}, ${img.width} by ${img.height} pixels`);
  const text = [
    `Church: ${churchName}`,
    `Request: ${prompt}`,
    `Page: ${width} by ${height} pixels (${width > height ? "landscape" : width === height ? "square" : "portrait"})`,
    images.length ? `Attached pictures, shown to you in this order:\n${imageLines.join("\n")}` : "No pictures are attached.",
  ].join("\n\n");

  let raw: string | null;
  try {
    raw = await generateVisionJsonCompletion(systemPrompt(), text, images.map((i) => i.preview));
  } catch {
    return { error: "The AI designer couldn't be reached just now. Please try again in a moment." };
  }
  if (!raw) return { error: "The AI designer didn't answer. Please try again." };
  return buildDocFromAi(raw, width, height, images.map((i) => ({ ref: i.ref, width: i.width, height: i.height })));
}
