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
import { existsSync } from "fs";
import { dirname, join } from "path";
import { DEFAULT_CONFIG_BACKUPS, DEFAULT_ENGINE, DETECTED } from "../const/const";
import type { MonitorMode, OverlayDisplayMode } from "../utils/buildKeyImage";
import { buildPlaylistKeyImage } from "../utils/buildPlaylistKeyImage";
import { getPlaylistItemDetails } from "../utils/getPlaylistItemDetails";
import { listMonitors } from "../utils/listMonitors";
import { listPlaylists } from "../utils/listPlaylists";
import { wrapTitle } from "../utils/wrapTitle";

type LoadPlaylistSettings = {
  playlistName?: string;
  wallpaperEnginePath?: string;
  configBackupsPath?: string;
  overlayDisplayMode?: OverlayDisplayMode;
  showTitle?: boolean;
  monitorMode?: MonitorMode;
  monitorIndex?: string;
};

type PluginMessage = {
  event: string;
  playlistName?: string;
};

const MAX_PI_ITEMS = 50;

@action({ UUID: "com.unai-gonzalez.wallpaper-deck.load-playlist" })
export class LoadPlaylist extends SingletonAction<LoadPlaylistSettings> {
  private readonly settingsCache = new Map<string, LoadPlaylistSettings>();

  private cacheSettings(id: string, settings: LoadPlaylistSettings): void {
    this.settingsCache.set(id, settings);
  }

  private getCachedEnginePath(id: string): string {
    return this.settingsCache.get(id)?.wallpaperEnginePath || DEFAULT_ENGINE;
  }

  private getCachedConfigBackupsPath(id: string): string {
    const override = this.settingsCache.get(id)?.configBackupsPath;
    if (override) return override;

    const enginePath = this.getCachedEnginePath(id);
    return enginePath === DEFAULT_ENGINE ? DEFAULT_CONFIG_BACKUPS : join(dirname(enginePath), "config_backups");
  }

  private findPlaylist(configBackupsPath: string, playlistName: string) {
    return listPlaylists(configBackupsPath).find((p) => p.name === playlistName);
  }

  private findPlaylistItems(configBackupsPath: string, playlistName: string): string[] {
    return this.findPlaylist(configBackupsPath, playlistName)?.items ?? [];
  }

  private async updateButtonImage(
    actionId: string,
    setImage: (png: string) => Promise<void>,
    settings: LoadPlaylistSettings,
  ): Promise<void> {
    const { playlistName, overlayDisplayMode, monitorMode, monitorIndex } = settings;
    if (!playlistName) return;

    const configBackupsPath = this.getCachedConfigBackupsPath(actionId);
    const items = this.findPlaylistItems(configBackupsPath, playlistName);
    const image = await buildPlaylistKeyImage(items, overlayDisplayMode, monitorMode, monitorIndex);
    await setImage(image);
  }

  private openPlaylist(enginePath: string, playlistName: string, monitorIndex?: number): Promise<void> {
    const args = ["-control", "openPlaylist", "-playlist", playlistName];
    if (monitorIndex !== undefined) args.push("-monitor", String(monitorIndex));
    return new Promise((resolve, reject) => {
      execFile(enginePath, args, (err) => (err ? reject(err) : resolve()));
    });
  }

  override async onKeyDown(ev: KeyDownEvent<LoadPlaylistSettings>): Promise<void> {
    this.cacheSettings(ev.action.id, ev.payload.settings);

    const { playlistName, monitorMode, monitorIndex } = ev.payload.settings;
    const enginePath = this.getCachedEnginePath(ev.action.id);

    if (!playlistName) {
      streamDeck.logger.error(`No playlist selected for action ${ev.action.id}`);
      await ev.action.showAlert();
      return;
    }

    if (!existsSync(enginePath)) {
      streamDeck.logger.error(`Wallpaper Engine not found: ${enginePath}`);
      await ev.action.showAlert();
      return;
    }

    try {
      if (monitorMode === "specific" && monitorIndex !== undefined) {
        await this.openPlaylist(enginePath, playlistName, Number(monitorIndex));
      } else if (monitorMode === "all") {
        const monitors = await listMonitors();
        if (monitors.length === 0) {
          await this.openPlaylist(enginePath, playlistName);
        } else {
          await Promise.all(monitors.map((m) => this.openPlaylist(enginePath, playlistName, m.index)));
        }
      } else {
        await this.openPlaylist(enginePath, playlistName);
      }
      streamDeck.logger.info(`Playlist loaded: ${playlistName}`);
      await ev.action.showOk();
    } catch (e) {
      streamDeck.logger.error(`Playlist load failed: ${e}`);
      await ev.action.showAlert();
    }
  }

  override async onWillAppear(ev: WillAppearEvent<LoadPlaylistSettings>): Promise<void> {
    this.cacheSettings(ev.action.id, ev.payload.settings);
    const { playlistName, showTitle } = ev.payload.settings;
    if (playlistName) {
      await this.updateButtonImage(ev.action.id, (png) => ev.action.setImage(png), ev.payload.settings);
      await ev.action.setTitle(showTitle ? wrapTitle(playlistName) : "");
    }
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<LoadPlaylistSettings>): Promise<void> {
    this.cacheSettings(ev.action.id, ev.payload.settings);
    const { playlistName, showTitle } = ev.payload.settings;
    if (playlistName) {
      await this.updateButtonImage(ev.action.id, (png) => ev.action.setImage(png), ev.payload.settings);
      await ev.action.setTitle(showTitle ? wrapTitle(playlistName) : "");
    }
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, LoadPlaylistSettings>): Promise<void> {
    const msg = ev.payload as PluginMessage;

    try {
      if (msg.event === "getDetectedPaths") {
        await streamDeck.ui.sendToPropertyInspector({
          event: "detectedPaths",
          enginePath: DETECTED?.enginePath ?? null,
          configBackupsPath: DEFAULT_CONFIG_BACKUPS,
        });
      } else if (msg.event === "getPlaylists") {
        const configBackupsPath = this.getCachedConfigBackupsPath(ev.action.id);
        streamDeck.logger.info(`Loading playlists from: ${configBackupsPath}`);
        const items = listPlaylists(configBackupsPath).map((p) => ({
          label: `${p.name} (${p.items.length})`,
          value: p.name,
        }));
        streamDeck.logger.info(`Found ${items.length} playlists`);
        await streamDeck.ui.sendToPropertyInspector({ event: "getPlaylists", items });
      } else if (msg.event === "getPlaylistItems" && msg.playlistName) {
        const configBackupsPath = this.getCachedConfigBackupsPath(ev.action.id);
        const playlist = this.findPlaylist(configBackupsPath, msg.playlistName);
        const allItems = playlist?.items ?? [];
        const items = getPlaylistItemDetails(allItems.slice(0, MAX_PI_ITEMS));
        await streamDeck.ui.sendToPropertyInspector({
          event: "getPlaylistItems",
          items,
          totalCount: allItems.length,
          settings: playlist?.settings ?? null,
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
