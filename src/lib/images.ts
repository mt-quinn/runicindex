import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";
import sharp from "sharp";

export function imagesEnabled(): boolean {
  // Generation requires only Gemini. Storage (Blob) is optional for local dev.
  return Boolean(process.env.GEMINI_API_KEY);
}

export function imagesCanPersist(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";

export async function generateAndStoreCompanyLogo(args: {
  companyId: string;
  prompt: string;
}): Promise<string | undefined> {
  if (!imagesEnabled()) return undefined;

  const model = process.env.GEMINI_IMAGE_MODEL_ID || DEFAULT_IMAGE_MODEL;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const fullPrompt = buildLogoPrompt(args.prompt);
  const response = await ai.models.generateContent({
    model,
    contents: fullPrompt,
  });

  const base64 = extractInlineBase64(response);
  if (!base64) return undefined;
  const imageBuffer = Buffer.from(base64, "base64");

  // For logos we want a crisp square with no chroma-keying.
  const png = await sharp(imageBuffer).resize(256, 256, { fit: "cover" }).png().toBuffer();

  if (!imagesCanPersist()) return `data:image/png;base64,${png.toString("base64")}`;

  const blobPath = `logos/${args.companyId}.png`;
  const blob = await put(blobPath, png, {
    access: "public",
    addRandomSuffix: false,
    contentType: "image/png",
  });
  return blob.url;
}

export async function generateAndStoreNewsImage(args: {
  hourKey: string;
  newsId: string;
  prompt: string;
}): Promise<string | undefined> {
  if (!imagesEnabled()) return undefined;

  const model = process.env.GEMINI_IMAGE_MODEL_ID || DEFAULT_IMAGE_MODEL;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const fullPrompt = buildNewsPrompt(args.prompt);
  const response = await ai.models.generateContent({
    model,
    contents: fullPrompt,
  });

  const base64 = extractInlineBase64(response);
  if (!base64) return undefined;
  const imageBuffer = Buffer.from(base64, "base64");

  const png = await sharp(imageBuffer).resize(768, 432, { fit: "cover" }).png().toBuffer();

  if (!imagesCanPersist()) return `data:image/png;base64,${png.toString("base64")}`;

  const blobPath = `news/${args.hourKey}/${args.newsId}.png`;
  const blob = await put(blobPath, png, {
    access: "public",
    addRandomSuffix: false,
    contentType: "image/png",
  });
  return blob.url;
}

function extractInlineBase64(response: any): string | undefined {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p: any) => p?.inlineData?.data) as any;
  return inline?.inlineData?.data as string | undefined;
}

function buildLogoPrompt(conceptPrompt: string): string {
  // Keep it very legible at small sizes and avoid text.
  return `Create a square logo icon for a fantasy stock market company.

Rules:
- NO text, NO letters, NO numbers, NO watermark, NO border.
- High contrast, readable at small size.
- Clean vector-like illustration (not photoreal).
- Centered icon on a simple background.

Subject prompt:
${conceptPrompt}

Output: a single square image.`.trim();
}

function buildNewsPrompt(newsPrompt: string): string {
  return `Create an illustration for a fantasy stock market news story.

Rules:
- NO text, NO watermark, NO border.
- Clean, readable illustration (not photoreal).
- Dramatic but legible composition.

Story prompt:
${newsPrompt}

Output: a single image.`.trim();
}


