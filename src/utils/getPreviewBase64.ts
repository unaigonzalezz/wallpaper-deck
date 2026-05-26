import streamDeck from "@elgato/streamdeck";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export function getPreviewBase64(basePath: string, wallpaperId: string): string | null {
  const dir = join(basePath, wallpaperId);
  for (const ext of ["jpg", "jpeg", "png", "gif"]) {
    const filePath = join(dir, `preview.${ext}`);
    if (existsSync(filePath)) {
      try {
        const data = readFileSync(filePath);
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        return `data:${mime};base64,${data.toString("base64")}`;
      } catch (e) {
        streamDeck.logger.error(`Error reading preview file ${filePath}: ${e}`);
      }
    }
  }
  return null;
}