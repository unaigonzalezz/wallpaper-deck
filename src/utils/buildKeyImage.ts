import sharp from "sharp";
import { KEY_SIZE, LOGO_PATH, LOGO_PATH_TEXT, LOGO_WIDTH, LOGO_WIDTH_TEXT } from "../const/const";

export type LogoMode = "logo" | "icon" | "none";

export async function buildKeyImage(preview: string | null, logoMode: LogoMode = "icon"): Promise<string> {
  let base: Buffer;
  if (preview) {
    const raw = Buffer.from(preview.split(",")[1], "base64");
    base = await sharp(raw).resize(KEY_SIZE, KEY_SIZE, { fit: "cover" }).png().toBuffer();
  } else {
    base = await sharp({
      create: { width: KEY_SIZE, height: KEY_SIZE, channels: 4, background: { r: 26, g: 26, b: 26, alpha: 1 } },
    })
      .png()
      .toBuffer();
  }

  if (logoMode === "none") {
    return "data:image/png;base64," + base.toString("base64");
  }

  const logoPath = logoMode === "logo" ? LOGO_PATH_TEXT : LOGO_PATH;
  const logoWidth = logoMode === "logo" ? LOGO_WIDTH_TEXT : LOGO_WIDTH;

  const { data: logo, info: logoInfo } = await sharp(logoPath)
    .resize({ width: logoWidth, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });

  const composed = await sharp(base)
    .composite([{ input: logo, top: KEY_SIZE - logoInfo.height - 2, left: 2 }])
    .png()
    .toBuffer();

  return "data:image/png;base64," + composed.toString("base64");
}
