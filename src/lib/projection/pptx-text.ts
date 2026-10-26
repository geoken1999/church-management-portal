import JSZip from "jszip";

// The words on each slide of a .pptx, in slide order. A PowerPoint file is a zip of XML parts; every run of text sits in an
// <a:t> element and every paragraph is an <a:p>. This does not draw anything: it is the fallback when a deck can't be drawn,
// and the text kept with each slide picture. Works in the browser and in Node.

const decode = (text: string) =>
  text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

/** The paragraphs of one slide's XML, each the joined text of its runs. Empty paragraphs are dropped. */
export function paragraphsOf(xml: string): string[] {
  const paragraphs: string[] = [];
  for (const paragraph of xml.matchAll(/<a:p[ >][\s\S]*?<\/a:p>/g)) {
    const runs = [...paragraph[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decode(m[1]));
    const line = runs.join("").trim();
    if (line) paragraphs.push(line);
  }
  return paragraphs;
}

export async function extractSlideTexts(data: ArrayBuffer | Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .map((name) => ({ name, match: name.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
    .filter((f): f is { name: string; match: RegExpMatchArray } => f.match !== null)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
  const texts: string[] = [];
  for (const slide of slides) texts.push(paragraphsOf(await zip.files[slide.name].async("string")).join("\n"));
  return texts;
}
