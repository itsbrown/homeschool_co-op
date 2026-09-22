export async function parsePdfText(buf: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
    data: Buffer,
  ) => Promise<{ text?: string }>;
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await pdfParse(Buffer.from(buf));
      return data.text || "";
    } catch (err) {
      last = err;
    }
  }
  throw last;
}
