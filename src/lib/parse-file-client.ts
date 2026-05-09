export type ParsedFileResult = {
  name: string;
  text: string;
  type: "text" | "image" | "pdf";
};

export async function parseFileClient(file: File): Promise<ParsedFileResult> {
  const name = file.name;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { name, text: result.value, type: "text" };
  }

  if (ext === "pptx") {
    const JSZip = (await import("jszip")).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const slideFiles = Object.keys(zip.files)
      .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0");
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0");
        return numA - numB;
      });

    const slideTexts: string[] = [];
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

    return {
      name,
      text: slideTexts
        .map((t, i) => `--- Слайд ${i + 1} ---\n${t}`)
        .join("\n\n"),
      type: "text",
    };
  }

  if (ext === "txt" || ext === "md") {
    const text = await file.text();
    return { name, text, type: "text" };
  }

  if (ext === "pdf") {
    return { name, text: "", type: "pdf" };
  }

  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return { name, text: "", type: "image" };
  }

  try {
    const text = await file.text();
    return { name, text, type: "text" };
  } catch {
    return { name, text: "", type: "text" };
  }
}
