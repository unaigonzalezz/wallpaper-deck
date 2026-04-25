import streamDeck from "@elgato/streamdeck";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export function detectWallpaperEngine(): { enginePath: string; basePath: string } | null {
  try {
    let steamPath: string | null = null;
    for (const regKey of ["HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "HKCU\\Software\\Valve\\Steam"]) {
      try {
        const out = execSync(`reg query "${regKey}" /v InstallPath 2>nul`, { encoding: "utf8" });
        const m = out.match(/InstallPath\s+REG_SZ\s+(.+)/);
        if (m) {
          steamPath = m[1].trim();
          break;
        }
      } catch {
        streamDeck.logger.error(`Wallpaper Engine detection: registry key ${regKey} not found`);
      }
    }
    if (!steamPath) return null;

    const libraries: string[] = [steamPath];
    const vdfPath = join(steamPath, "steamapps", "libraryfolders.vdf");
    if (existsSync(vdfPath)) {
      const vdf = readFileSync(vdfPath, "utf-8");
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
        const p = m[1].replace(/\\\\/g, "\\");
        if (!libraries.includes(p)) libraries.push(p);
      }
    }

    for (const lib of libraries) {
      const enginePath = join(lib, "steamapps", "common", "wallpaper_engine", "wallpaper64.exe");
      if (existsSync(enginePath)) {
        return { enginePath, basePath: join(lib, "steamapps", "workshop", "content", "431960") };
      }
    }
  } catch (error) {
    streamDeck.logger.error(`Wallpaper Engine detection failed: ${error}`);
  }
  return null;
}
