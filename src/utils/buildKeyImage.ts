import { Jimp } from "jimp";
import { KEY_SIZE, LOGO_PATH, LOGO_PATH_TEXT, LOGO_WIDTH, LOGO_WIDTH_TEXT } from "../const/const";

export type LogoMode = "logo" | "icon" | "none";

export async function buildKeyImage(preview: string | null, logoMode: LogoMode = "icon"): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let base: any;

  if (preview) {
    const raw = Buffer.from(preview.split(",")[1], "base64");
    base = await Jimp.fromBuffer(raw);
    base.cover({ w: KEY_SIZE, h: KEY_SIZE });
  } else {
    base = new Jimp({ width: KEY_SIZE, height: KEY_SIZE, color: 0x1a1a1aff });
  }

  if (logoMode === "none") {
    const buf = await base.getBuffer("image/png");
    return "data:image/png;base64," + buf.toString("base64");
  }

  const logoPath = logoMode === "logo" ? LOGO_PATH_TEXT : LOGO_PATH;
  const logoWidth = logoMode === "logo" ? LOGO_WIDTH_TEXT : LOGO_WIDTH;

  const logo = await Jimp.read(logoPath);
  logo.resize({ w: logoWidth });

  base.composite(logo, 2, KEY_SIZE - logo.height - 2);

  const buf = await base.getBuffer("image/png");
  return "data:image/png;base64," + buf.toString("base64");
}
