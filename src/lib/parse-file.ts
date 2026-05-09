import mammoth from "mammoth";
import JSZip from "jszip";

export type ParsedFile = {
  name: string;
  text: string;
  type: string;
  base64?: string;
  mediaType?: string;
};

export async function parseFile(file: File): Promise<ParsedFile> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const name = file.name;
  const type = file.type || guessType(name);

  if (type.startsWith("image/")) {
    return {
      name,
      text: "",
      type,
      base64: buffer.toString("base64"),
      mediaType: type,
    };
  }

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return {
      name,
      text: "",
      type: "application/pdf",
      base64: buffer.toString("base64"),
      mediaType: "application/pdf",
    };
  }

  if (
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { name, text: result.value, type: "docx" };
  }

  if (
    type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    name.endsWith(".pptx")
  ) {
    const text = await extractPptxText(buffer);
    return { name, text, type: "pptx" };
  }

  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return { name, text: buffer.toString("utf-8"), type: "text" };
  }

  return { name, text: buffer.toString("utf-8"), type: "unknown" };
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideTexts: string[] = [];

  const slideFiles = Object.keys(zip.files)
    .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0");
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0");
      return numA - numB;
    });

  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async("string");
    const texts = xml.match(/<a:t>([^<]*)<\/a:t>/g);
    if (texts) {
      const slideText = texts
        .map((t) => t.replace(/<\/?a:t>/g, ""))
        .join(" ");
      slideTexts.push(slideText);
    }
  }

  return slideTexts
    .map((t, i) => `--- Слайд ${i + 1} ---\n${t}`)
    .join("\n\n");
}

function guessType(name: string): string {
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
