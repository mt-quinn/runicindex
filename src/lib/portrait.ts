import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";
import sharp from "sharp";

import type { HiddenProfile, VisibleProfile } from "@/lib/types";

export function portraitsEnabled(): boolean {
  // Generation requires only Gemini. Storage (Blob) is optional for local dev.
  return Boolean(process.env.GEMINI_API_KEY);
}

export function portraitsCanPersist(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function generateAndStorePortrait(args: {
  seed: string;
  gameId: string;
  visible: VisibleProfile;
  hidden: HiddenProfile;
}): Promise<string | undefined> {
  if (!portraitsEnabled()) return undefined;

  const model = process.env.GEMINI_IMAGE_MODEL_ID || "gemini-2.5-flash-image";
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const prompt = buildPortraitPrompt(args.visible, args.hidden);
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p: any) => p?.inlineData?.data) as any;
  const base64 = inline?.inlineData?.data as string | undefined;
  if (!base64) return undefined;

  const imageBuffer = Buffer.from(base64, "base64");
  const cutout = await chromaKeyLimeToAlpha(imageBuffer);

  // Local dev: no Blob token, so return a data URL that the client can render immediately.
  if (!portraitsCanPersist()) {
    return `data:image/png;base64,${cutout.toString("base64")}`;
  }

  const blobPath = `portraits/${args.gameId}.png`;
  const blob = await put(blobPath, cutout, {
    access: "public",
    addRandomSuffix: false,
    contentType: "image/png",
  });

  return blob.url;
}

function buildPortraitPrompt(visible: VisibleProfile, hidden: HiddenProfile): string {
  // Gemini "Nano Banana" does not support transparency, so we force a chroma key background.
  // We'll key out the exact lime green on the server.
  return `Create a CLOSE-UP head-and-shoulders BUST portrait of this deceased human soul for a mobile web game.

Style:
- Clean, readable, slightly stylized illustration (not photoreal).
- Strong silhouette and clear facial features.
- No text, no watermark, no frame, no border.
- SINGLE SOLID BACKGROUND color: pure lime green #00FF00 filling the entire background. No gradients, no shadows on background.
- The subject must NOT contain lime green (#00FF00) anywhere (no green clothes, no green accessories, no green lighting).
- Crop: HEAD AND SHOULDERS ONLY, cut off around upper chest. NO full torso. NO arms. NO hands. NO props.
- Framing: the head+shoulders should fill ~75–85% of the image height. Centered, facing forward.

Character details:
- Name: ${visible.name}
- Age: ${visible.age}
- Occupation: ${visible.occupation}
- Cause of death: ${visible.causeOfDeath}
- Bio: ${hidden.bio}

Output: a single image.`.trim();
}

async function chromaKeyLimeToAlpha(input: Buffer): Promise<Buffer> {
  // Constrain size for perf (and stable results), but keep enough detail for a crisp cutout.
  const { data, info } = await sharp(input)
    .resize(768, 768, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);

  const width = info.width;
  const height = info.height;

  // Sometimes the model ignores the exact #00FF00 instruction. So:
  // 1) sample the *actual* background color from the border/corners
  // 2) flood-fill from corners within tolerance (adjacency-based) so we ONLY remove background
  //    pixels connected to the outside. This avoids keying out any internal portrait details
  //    that happen to share a similar color.
  const bg = sampleBackgroundRGB(out, width, height);
  const tol = bg.tol; // adaptive tolerance in RGB space
  const tolSq = tol * tol;

  const visited = new Uint8Array(width * height);
  const q = new Int32Array(width * height);
  let qh = 0;
  let qt = 0;

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const o = idx * 4;
    const dr = out[o]! - bg.r;
    const dg = out[o + 1]! - bg.g;
    const db = out[o + 2]! - bg.b;
    const d2 = dr * dr + dg * dg + db * db;
    if (d2 > tolSq) return;
    visited[idx] = 1;
    q[qt++] = idx;
  };

  // Seed corners + a few points along edges (to handle slight vignettes/gradients).
  const edgeSteps = 12;
  const seed = (x: number, y: number) => push(x, y);
  seed(0, 0);
  seed(width - 1, 0);
  seed(0, height - 1);
  seed(width - 1, height - 1);
  for (let i = 1; i < edgeSteps; i++) {
    const x = Math.round((i / edgeSteps) * (width - 1));
    const y = Math.round((i / edgeSteps) * (height - 1));
    seed(x, 0);
    seed(x, height - 1);
    seed(0, y);
    seed(width - 1, y);
  }

  while (qh < qt) {
    const idx = q[qh++]!;
    const x = idx % width;
    const y = (idx / width) | 0;
    // clear alpha for background pixels
    out[idx * 4 + 3] = 0;
    // 4-neighborhood
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  // Adjacency-only feathering:
  // For pixels *next to* removed background (alpha=0), softly reduce alpha if they are close
  // to the sampled background. This smooths edges without touching similarly-colored interior pixels.
  const soft = tol + 36;
  const softSq = soft * soft;

  const isCleared = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    return out[(y * width + x) * 4 + 3] === 0;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue; // already cleared
      const o = idx * 4;
      const a = out[o + 3]!;
      if (a === 0) continue;
      // Only consider pixels adjacent to cleared background.
      if (
        !isCleared(x + 1, y) &&
        !isCleared(x - 1, y) &&
        !isCleared(x, y + 1) &&
        !isCleared(x, y - 1)
      ) {
        continue;
      }
      const dr = out[o]! - bg.r;
      const dg = out[o + 1]! - bg.g;
      const db = out[o + 2]! - bg.b;
      const d2 = dr * dr + dg * dg + db * db;
      if (d2 >= softSq) continue;
      // d2: 0..soft^2 maps to alpha 0..255 (clamped by existing alpha)
      const t = Math.min(1, Math.max(0, d2 / softSq));
      const targetAlpha = Math.round(255 * t);
      out[o + 3] = Math.min(a, targetAlpha);
    }
  }

  const keyed = sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });

  // Trim away transparent padding so scaling affects the subject, not empty pixels.
  const { left, top, width: bw, height: bh } = alphaBoundingBox(out, width, height);
  if (bw > 0 && bh > 0) {
    const pad = 24; // a little breathing room
    const cropLeft = Math.max(0, left - pad);
    const cropTop = Math.max(0, top - pad);
    const cropW = Math.min(width - cropLeft, bw + pad * 2);
    const cropH = Math.min(height - cropTop, bh + pad * 2);

    // Normalize scale so the subject reliably fills the frame (bottom-anchored).
    // This is what makes "make it bigger" actually mean "the person gets bigger",
    // instead of scaling transparent padding.
    const canvas = 1024;
    const targetFill = 0.92; // subject height target as a fraction of canvas
    const targetH = Math.round(canvas * targetFill);

    // Scale to hit target height, but never exceed canvas width.
    const scaleH = targetH / cropH;
    const scaleW = canvas / cropW;
    const scale = Math.min(scaleH, scaleW);

    const resizedW = Math.max(1, Math.round(cropW * scale));
    const resizedH = Math.max(1, Math.round(cropH * scale));

    const resized = await keyed
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .resize(resizedW, resizedH, { fit: "fill" })
      .png()
      .toBuffer();

    const leftX = Math.round((canvas - resizedW) / 2);
    const topY = Math.max(0, canvas - resizedH);

    return sharp({
      create: {
        width: canvas,
        height: canvas,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: resized, left: leftX, top: topY }])
      .png()
      .toBuffer();
  }

  return keyed.png().toBuffer();
}

function sampleBackgroundRGB(
  buf: Buffer,
  width: number,
  height: number,
): { r: number; g: number; b: number; tol: number } {
  // Sample a small set of pixels near the corners and along the outer border,
  // then take channel-wise median to be robust against small artifacts.
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  const take = (x: number, y: number) => {
    x = Math.max(0, Math.min(width - 1, x));
    y = Math.max(0, Math.min(height - 1, y));
    const o = (y * width + x) * 4;
    rs.push(buf[o]!);
    gs.push(buf[o + 1]!);
    bs.push(buf[o + 2]!);
  };

  // Corners + 6px inset corners
  const inset = 6;
  const pts = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [inset, inset],
    [width - 1 - inset, inset],
    [inset, height - 1 - inset],
    [width - 1 - inset, height - 1 - inset],
  ] as const;
  for (const [x, y] of pts) take(x, y);

  // Border samples
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const x = Math.round((i / n) * (width - 1));
    const y = Math.round((i / n) * (height - 1));
    take(x, 0);
    take(x, height - 1);
    take(0, y);
    take(width - 1, y);
  }

  const median = (arr: number[]) => {
    const a = arr.slice().sort((a, b) => a - b);
    return a[(a.length / 2) | 0] ?? 0;
  };

  const r = median(rs);
  const g = median(gs);
  const b = median(bs);

  // Derive an adaptive tolerance based on how varied the sampled border pixels are.
  // This protects against "almost solid" backgrounds where the model returns slightly different greens.
  const dists: number[] = [];
  for (let i = 0; i < rs.length; i++) {
    const dr = rs[i]! - r;
    const dg = gs[i]! - g;
    const db = bs[i]! - b;
    dists.push(Math.sqrt(dr * dr + dg * dg + db * db));
  }
  dists.sort((a, b) => a - b);
  const p90 = dists[Math.floor(dists.length * 0.9)] ?? 0;
  const tol = Math.min(180, Math.max(60, Math.round(p90 + 36)));

  return { r, g, b, tol };
}

function alphaBoundingBox(buf: Buffer, width: number, height: number): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  // Find bounding box of pixels with alpha above a small threshold.
  const alphaMin = 18;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = buf[(y * width + x) * 4 + 3]!;
      if (a <= alphaMin) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return { left: 0, top: 0, width: 0, height: 0 };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}


