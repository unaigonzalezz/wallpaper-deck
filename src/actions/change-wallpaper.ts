import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { execFile } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_BASE, DEFAULT_ENGINE, DETECTED } from "../const/const";
import { buildKeyImage, LogoMode } from "../utils/buildKeyImage";

type WallpaperSettings = {
  wallpaperId?: string;
  wallpaperTitle?: string;
  wallpaperEnginePath?: string;
  wallpaperBasePath?: string;
  logoMode?: LogoMode;
};

type PluginMessage = {
  event: string;
  wallpaperId?: string;
  basePath?: string;
};

@action({ UUID: "com.unai-gonzalez.wallpaper-deck.change-wallpaper" })
export class WallpaperChange extends SingletonAction<WallpaperSettings> {
  private readonly settingsCache = new Map<string, WallpaperSettings>();

  private cacheSettings(id: string, settings: WallpaperSettings): void {
    this.settingsCache.set(id, settings);
  }

  private getCachedBasePath(id: string): string {
    return this.settingsCache.get(id)?.wallpaperBasePath || DEFAULT_BASE;
  }

  private getCachedEnginePath(id: string): string {
    return this.settingsCache.get(id)?.wallpaperEnginePath || DEFAULT_ENGINE;
  }

  override async onKeyDown(ev: KeyDownEvent<WallpaperSettings>): Promise<void> {
    const { wallpaperId } = ev.payload.settings;
    this.cacheSettings(ev.action.id, ev.payload.settings);

    if (!wallpaperId) {
      streamDeck.logger.error(`No wallpaper selected for action ${ev.action.id}`);
      await ev.action.showAlert();
      return;
    }

    const enginePath = this.getCachedEnginePath(ev.action.id);
    const basePath = this.getCachedBasePath(ev.action.id);
    const projectFile = join(basePath, wallpaperId, "project.json");

    streamDeck.logger.info(`Starting wallpaper change: ${enginePath}`);

    if (!existsSync(enginePath)) {
      streamDeck.logger.error(`Wallpaper Engine not found: ${enginePath}`);
      await ev.action.showAlert();
      return;
    }

    const action = ev.action;
    execFile(enginePath, ["-control", "openWallpaper", "-file", projectFile], (err) => {
      if (err) {
        streamDeck.logger.error(`Wallpaper change failed: ${err.message}`);
        action.showAlert();
      } else {
        streamDeck.logger.info(`Wallpaper changed: ${wallpaperId}`);
        ev.action.showOk();
      }
    });
  }

  override async onWillAppear(ev: WillAppearEvent<WallpaperSettings>): Promise<void> {
    this.cacheSettings(ev.action.id, ev.payload.settings);
    const { wallpaperId, logoMode } = ev.payload.settings;
    if (wallpaperId) {
      const preview = getPreviewBase64(this.getCachedBasePath(ev.action.id), wallpaperId);
      await ev.action.setImage(await buildKeyImage(preview, logoMode ?? "logo"));
    }
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<WallpaperSettings>): Promise<void> {
    this.cacheSettings(ev.action.id, ev.payload.settings);
    const { wallpaperId, logoMode } = ev.payload.settings;
    if (wallpaperId) {
      const preview = getPreviewBase64(this.getCachedBasePath(ev.action.id), wallpaperId);
      await ev.action.setImage(await buildKeyImage(preview, logoMode ?? "icon"));
    }
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, WallpaperSettings>): Promise<void> {
    const msg = ev.payload as PluginMessage;

    try {
      if (msg.event === "getDetectedPaths") {
        await streamDeck.ui.sendToPropertyInspector({
          event: "detectedPaths",
          enginePath: DETECTED?.enginePath ?? null,
          basePath: DETECTED?.basePath ?? null,
        });
      } else if (msg.event === "getWallpapers") {
        const basePath = this.getCachedBasePath(ev.action.id);
        streamDeck.logger.info(`Loading wallpapers from: ${basePath}`);
        const items = listWallpapers(basePath).map((w) => ({ label: w.title, value: w.id }));
        streamDeck.logger.info(`Found ${items.length} wallpapers`);
        await streamDeck.ui.sendToPropertyInspector({ event: "getWallpapers", items });
      } else if (msg.event === "getPreview" && msg.wallpaperId) {
        const basePath = this.getCachedBasePath(ev.action.id);
        const image = getPreviewBase64(basePath, msg.wallpaperId);
        await streamDeck.ui.sendToPropertyInspector({ event: "previewImage", image });
      }
    } catch (e) {
      streamDeck.logger.error(`onSendToPlugin error: ${e}`);
    }
  }
}

function getPreviewBase64(basePath: string, wallpaperId: string): string | null {
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

function listWallpapers(basePath: string): { id: string; title: string }[] {
  if (!existsSync(basePath)) {
    streamDeck.logger.warn(`Wallpaper base path not found: ${basePath}`);
    return [];
  }

  const results: { id: string; title: string }[] = [];

  try {
    for (const entry of readdirSync(basePath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const projectFile = join(basePath, id, "project.json");
      let title = id;
      if (existsSync(projectFile)) {
        try {
          const proj = JSON.parse(readFileSync(projectFile, "utf-8"));
          title = proj.title || proj.name || id;
        } catch (e) {
          streamDeck.logger.error(`Error parsing project file ${projectFile}: ${e}`);
        }
      }
      results.push({ id, title });
    }
  } catch (e) {
    streamDeck.logger.error(`Error listing wallpapers at ${basePath}: ${e}`);
  }

  return results.sort((a, b) => a.title.localeCompare(b.title));
}
