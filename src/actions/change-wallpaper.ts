import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { execFile } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_BASE, DEFAULT_ENGINE, DETECTED } from "../const/const";
import {
  buildKeyImage,
  buildKeyImageFrames,
  LogoMode,
  migrateLogoMode,
  MonitorMode,
  OverlayDisplayMode,
  type KeyFrame,
} from "../utils/buildKeyImage";
import { getPreviewBase64 } from "../utils/getPreviewBase64";
import { listMonitors } from "../utils/listMonitors";
import { parseGifFrames } from "../utils/parseGifFrames";
import { wrapTitle } from "../utils/wrapTitle";

type WallpaperSettings = {
  wallpaperId?: string;
  wallpaperTitle?: string;
  wallpaperEnginePath?: string;
  wallpaperBasePath?: string;
  /** @deprecated replaced by overlayDisplayMode, kept for migrating existing settings */
  logoMode?: LogoMode;
  overlayDisplayMode?: OverlayDisplayMode;
  showTitle?: boolean;
  animate?: boolean;
  monitorMode?: MonitorMode;
  monitorIndex?: string;
};

type PluginMessage = {
  event: string;
  wallpaperId?: string;
  basePath?: string;
};

@action({ UUID: "com.unai-gonzalez.wallpaper-deck.change-wallpaper" })
export class WallpaperChange extends SingletonAction<WallpaperSettings> {
  private readonly settingsCache = new Map<string, WallpaperSettings>();
  private readonly animationTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private cacheSettings(id: string, settings: WallpaperSettings): void {
    this.settingsCache.set(id, settings);
  }

  private getCachedBasePath(id: string): string {
    return this.settingsCache.get(id)?.wallpaperBasePath || DEFAULT_BASE;
  }

  private getCachedEnginePath(id: string): string {
    return this.settingsCache.get(id)?.wallpaperEnginePath || DEFAULT_ENGINE;
  }

  private resolveOverlayDisplayModeSetting(settings: WallpaperSettings): OverlayDisplayMode {
    if (settings.overlayDisplayMode) return settings.overlayDisplayMode;
    if (settings.logoMode) return migrateLogoMode(settings.logoMode);
    return "logo-monitor";
  }

  private stopAnimation(actionId: string): void {
    const timer = this.animationTimers.get(actionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.animationTimers.delete(actionId);
    }
  }

  private startAnimation(actionId: string, setImage: (png: string) => Promise<void>, frames: KeyFrame[]): void {
    this.stopAnimation(actionId);
    let frameIndex = 0;

    const tick = () => {
      if (!this.animationTimers.has(actionId)) return;
      const frame = frames[frameIndex];
      frameIndex = (frameIndex + 1) % frames.length;
      setImage(frame.png).catch(() => this.stopAnimation(actionId));
      this.animationTimers.set(actionId, setTimeout(tick, frame.delay));
    };

    this.animationTimers.set(actionId, setTimeout(tick, 0));
  }

  private async updateButtonImage(
    actionId: string,
    setImage: (png: string) => Promise<void>,
    settings: WallpaperSettings,
  ): Promise<void> {
    const { wallpaperId, animate, monitorMode, monitorIndex } = settings;
    if (!wallpaperId) return;

    const overlayDisplayMode = this.resolveOverlayDisplayModeSetting(settings);
    const preview = getPreviewBase64(this.getCachedBasePath(actionId), wallpaperId);

    this.stopAnimation(actionId);

    if (animate !== false && preview?.startsWith("data:image/gif")) {
      const raw = Buffer.from(preview.split(",")[1], "base64");
      const rawFrames = parseGifFrames(raw);
      if (rawFrames) {
        const frames = await buildKeyImageFrames(rawFrames, overlayDisplayMode, monitorMode, monitorIndex);
        this.startAnimation(actionId, setImage, frames);
        return;
      }
    }

    await setImage(await buildKeyImage(preview, overlayDisplayMode, monitorMode, monitorIndex));
  }

  private openWallpaper(enginePath: string, projectFile: string, monitorIndex?: number): Promise<void> {
    const args = ["-control", "openWallpaper", "-file", projectFile];
    if (monitorIndex !== undefined) args.push("-monitor", String(monitorIndex));
    return new Promise((resolve, reject) => {
      execFile(enginePath, args, (err) => (err ? reject(err) : resolve()));
    });
  }

  override async onKeyDown(ev: KeyDownEvent<WallpaperSettings>): Promise<void> {
    const { wallpaperId, monitorMode, monitorIndex } = ev.payload.settings;
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
      streamDeck.logger.info(`Wallpaper changed: ${wallpaperId}`);
      await ev.action.showOk();
    } catch (e) {
      streamDeck.logger.error(`Wallpaper change failed: ${e}`);
      await ev.action.showAlert();
    }
  }

  override async onWillAppear(ev: WillAppearEvent<WallpaperSettings>): Promise<void> {
    const settings = ev.payload.settings;
    if (settings.animate === undefined) {
      await ev.action.setSettings({ ...settings, animate: true });
      return;
    }
    if (!settings.overlayDisplayMode && settings.logoMode) {
      const { logoMode, ...rest } = settings;
      await ev.action.setSettings({ ...rest, overlayDisplayMode: migrateLogoMode(logoMode) });
      return;
    }
    this.cacheSettings(ev.action.id, settings);
    const { wallpaperId } = settings;
    if (wallpaperId) {
      await this.updateButtonImage(ev.action.id, (png) => ev.action.setImage(png), settings);
      await ev.action.setTitle(settings.showTitle ? wrapTitle(settings.wallpaperTitle || "") : "");
    }
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<WallpaperSettings>): Promise<void> {
    this.cacheSettings(ev.action.id, ev.payload.settings);
    const { wallpaperId } = ev.payload.settings;
    if (wallpaperId) {
      await this.updateButtonImage(ev.action.id, (png) => ev.action.setImage(png), ev.payload.settings);
      await ev.action.setTitle(
        ev.payload.settings.showTitle ? wrapTitle(ev.payload.settings.wallpaperTitle || "") : "",
      );
    }
  }

  override onWillDisappear(ev: WillDisappearEvent<WallpaperSettings>): void {
    this.stopAnimation(ev.action.id);
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
