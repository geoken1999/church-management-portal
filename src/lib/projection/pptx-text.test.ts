import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractSlideTexts, paragraphsOf } from "@/lib/projection/pptx-text";

const slideXml = (paragraphs: string[][]) =>
  `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>${paragraphs.map((runs) => `<a:p>${runs.map((r) => `<a:r><a:rPr lang="en-US"/><a:t>${r}</a:t></a:r>`).join("")}</a:p>`).join("")}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

describe("paragraphsOf", () => {
  it("joins the runs of a paragraph and drops empty ones", () => {
    expect(paragraphsOf(slideXml([["Amazing ", "grace"], [], ["How sweet"]]))).toEqual(["Amazing grace", "How sweet"]);
  });
  it("decodes entities", () => {
    expect(paragraphsOf(slideXml([["Tom &amp; Jerry &lt;3 &#8217;"]]))).toEqual(["Tom & Jerry <3 ’"]);
  });
});

describe("extractSlideTexts", () => {
  it("returns each slide's words in slide order, not file order", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide10.xml", slideXml([["Tenth"]]));
    zip.file("ppt/slides/slide2.xml", slideXml([["Second line one"], ["Second line two"]]));
    zip.file("ppt/slides/slide1.xml", slideXml([["First"]]));
    zip.file("ppt/slides/_rels/slide1.xml.rels", "<x/>");
    zip.file("ppt/presentation.xml", "<x/>");
    const data = await zip.generateAsync({ type: "uint8array" });
    expect(await extractSlideTexts(data)).toEqual(["First", "Second line one\nSecond line two", "Tenth"]);
  });
  it("is empty for a zip that isn't a presentation", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "hi");
    expect(await extractSlideTexts(await zip.generateAsync({ type: "uint8array" }))).toEqual([]);
  });
});
