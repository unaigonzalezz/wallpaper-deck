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
import type { MonitorMode } from "../utils/buildKeyImage";
import { listMonitors } from "../utils/listMonitors";

type RandomWallpaperSettings = {
  wallpaperEnginePath?: string;
  wallpaperBasePath?: string;
  monitorMode?: MonitorMode;
  monitorIndex?: string;
};

type PluginMessage = {
  event: string;
};

@action({ UUID: "com.unai-gonzalez.wallpaper-deck.random-wallpaper" })
export class RandomWallpaper extends SingletonAction<RandomWallpaperSettings> {
  private readonly settingsCache = new Map<string, RandomWallpaperSettings>();

  private cacheSettings(id: string, settings: RandomWallpaperSettings): void {
    this.settingsCache.set(id, settings);
  }

  private getCachedBasePath(id: string): string {
    return this.settingsCache.get(id)?.wallpaperBasePath || DEFAULT_BASE;
  }

  private getCachedEnginePath(id: string): string {
    return this.settingsCache.get(id)?.wallpaperEnginePath || DEFAULT_ENGINE;
  }

  private openWallpaper(enginePath: string, projectFile: string, monitorIndex?: number): Promise<void> {
    const args = ["-control", "openWallpaper", "-file", projectFile];
    if (monitorIndex !== undefined) args.push("-monitor", String(monitorIndex));
    return new Promise((resolve, reject) => {
      execFile(enginePath, args, (err) => (err ? reject(err) : resolve()));
    });
  }

  override async onKeyDown(ev: KeyDownEvent<RandomWallpaperSettings>): Promise<void> {
    this.cacheSettings(ev.action.id, ev.payload.settings);

    const { monitorMode, monitorIndex } = ev.payload.settings;
    const enginePath = this.getCachedEnginePath(ev.action.id);
    const basePath = this.getCachedBasePath(ev.action.id);

    if (!existsSync(enginePath)) {
      streamDeck.logger.error(`Wallpaper Engine not found: ${enginePath}`);
      await ev.action.showAlert();
      return;
    }

    const wallpapers = listWallpapers(basePath);
    if (wallpapers.length === 0) {
      streamDeck.logger.error(`No wallpapers found at: ${basePath}`);
      await ev.action.showAlert();
      return;
    }

    const picked = wallpapers[Math.floor(Math.random() * wallpapers.length)];
    const projectFile = join(basePath, picked.id, "project.json");

    streamDeck.logger.info(`Random wallpaper picked: ${picked.title} (${picked.id})`);

    const previewImage = getPreviewBase64(basePath, picked.id);

    try {
      if (monitorMode === "specific" && monitorIndex !== undefined) {
        await this.openWallpaper(enginePath, projectFile, Number(monitorIndex));
      } else if (monitorMode === "all") {
        const monitors = await listMonitors();
        if (monitors.length === 0) {
          await this.openWallpaper(enginePath, projectFile);
        } else {
          await Promise.all(monitors.map((m) => this.openWallpaper(enginePath, projectFile, m.index)));
        }
      } else {
        await this.openWallpaper(enginePath, projectFile);
      }
      streamDeck.logger.info(`Wallpaper changed to: ${picked.id}`);
      await ev.action.showOk();
      streamDeck.ui.sendToPropertyInspector({ event: "previewImage", image: previewImage }).catch(() => {});
    } catch (e) {
      streamDeck.logger.error(`Random wallpaper change failed: ${e}`);
      await ev.action.showAlert();
    }
  }

  override onWillAppear(ev: WillAppearEvent<RandomWallpaperSettings>): void {
    this.cacheSettings(ev.action.id, ev.payload.settings);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<RandomWallpaperSettings>): void {
    this.cacheSettings(ev.action.id, ev.payload.settings);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, RandomWallpaperSettings>): Promise<void> {
    const msg = ev.payload as PluginMessage;

    try {
      if (msg.event === "getDetectedPaths") {
        await streamDeck.ui.sendToPropertyInspector({
          event: "detectedPaths",
          enginePath: DETECTED?.enginePath ?? null,
          basePath: DETECTED?.basePath ?? null,
        });
      } else if (msg.event === "getMonitors") {
        const monitors = await listMonitors();
        const items = monitors.map((m) => ({
          label: `Monitor ${m.index + 1}${m.name ? ` - ${m.name}` : ""}${m.primary ? " (Primary)" : ""}, ${m.width}x${m.height}`,
          value: String(m.index),
        }));
        await streamDeck.ui.sendToPropertyInspector({ event: "getMonitors", items });
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

  return results;
}
