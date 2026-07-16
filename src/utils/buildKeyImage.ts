import streamDeck from "@elgato/streamdeck";
import { Jimp } from "jimp";
import {
  KEY_SIZE,
  LOGO_PATH_TEXT,
  LOGO_WIDTH_TEXT,
  MONITOR_ALL_ICON_PATH,
  MONITOR_BADGE_WIDTH,
  MONITOR_INDEX_ICON_PATHS,
  MONITOR_UNKNOWN_ICON_PATH,
} from "../const/const";
import type { RawGifFrame } from "./parseGifFrames";

export type LogoMode = "logo" | "icon" | "none";
export type MonitorMode = "default" | "specific" | "all";

/** The wallpaper preview always fills the background; this only controls the badges on top of it. */
export type OverlayDisplayMode = "logo-monitor" | "monitor" | "logo" | "none";

export interface KeyFrame {
  png: string;
  delay: number;
}

export interface ResolvedOverlay {
  showLogo: boolean;
  showMonitorBadge: boolean;
}

const OVERLAY_DISPLAY_MODES: Record<OverlayDisplayMode, ResolvedOverlay> = {
  "logo-monitor": { showLogo: true, showMonitorBadge: true },
  monitor: { showLogo: false, showMonitorBadge: true },
  logo: { showLogo: true, showMonitorBadge: false },
  none: { showLogo: false, showMonitorBadge: false },
};

export function resolveOverlayDisplayMode(mode: OverlayDisplayMode = "logo-monitor"): ResolvedOverlay {
  return OVERLAY_DISPLAY_MODES[mode] ?? OVERLAY_DISPLAY_MODES["logo-monitor"];
}

/** Maps the legacy `logoMode` setting to its equivalent OverlayDisplayMode. */
export function migrateLogoMode(logoMode: LogoMode): OverlayDisplayMode {
  return logoMode === "none" ? "none" : "logo-monitor";
}

function getMonitorBadgePath(monitorMode?: MonitorMode, monitorIndex?: string): string | null {
  if (monitorMode === "all") return MONITOR_ALL_ICON_PATH;
  if (monitorMode === "specific") {
    const index = monitorIndex !== undefined ? Number(monitorIndex) : NaN;
    return MONITOR_INDEX_ICON_PATHS[index] ?? MONITOR_UNKNOWN_ICON_PATH;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMonitorBadge(
  showMonitorBadge: boolean,
  monitorMode?: MonitorMode,
  monitorIndex?: string,
): Promise<any> {
  if (!showMonitorBadge) return null;
  const badgePath = getMonitorBadgePath(monitorMode, monitorIndex);
  if (!badgePath) return null;
  try {
    const badge = await Jimp.read(badgePath);
    badge.resize({ w: MONITOR_BADGE_WIDTH });
    return badge;
  } catch (e) {
    streamDeck.logger.warn(`Monitor badge icon not found at ${badgePath}: ${e}`);
    return null;
  }
}

export async function buildKeyImage(
  preview: string | null,
  overlayDisplayMode: OverlayDisplayMode = "logo-monitor",
  monitorMode?: MonitorMode,
  monitorIndex?: string,
): Promise<string> {
  const { showLogo, showMonitorBadge } = resolveOverlayDisplayMode(overlayDisplayMode);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let base: any;

  if (preview) {
    const raw = Buffer.from(preview.split(",")[1], "base64");
    base = await Jimp.fromBuffer(raw);
    base.cover({ w: KEY_SIZE, h: KEY_SIZE });
  } else {
    base = new Jimp({ width: KEY_SIZE, height: KEY_SIZE, color: 0x1a1a1aff });
  }

  const monitorBadge = await loadMonitorBadge(showMonitorBadge, monitorMode, monitorIndex);
  if (monitorBadge) base.composite(monitorBadge, KEY_SIZE - monitorBadge.width - 2, 2);

  if (showLogo) {
    const logo = await Jimp.read(LOGO_PATH_TEXT);
    logo.resize({ w: LOGO_WIDTH_TEXT });
    base.composite(logo, 2, KEY_SIZE - logo.height - 2);
  }

  const buf = await base.getBuffer("image/png");
  return "data:image/png;base64," + buf.toString("base64");
}

export async function buildKeyImageFrames(
  rawFrames: RawGifFrame[],
  overlayDisplayMode: OverlayDisplayMode = "logo-monitor",
  monitorMode?: MonitorMode,
  monitorIndex?: string,
): Promise<KeyFrame[]> {
  const { showLogo, showMonitorBadge } = resolveOverlayDisplayMode(overlayDisplayMode);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logo: any = null;
  if (showLogo) {
    logo = await Jimp.read(LOGO_PATH_TEXT);
    logo.resize({ w: LOGO_WIDTH_TEXT });
  }

  const monitorBadge = await loadMonitorBadge(showMonitorBadge, monitorMode, monitorIndex);

  const result: KeyFrame[] = [];
  for (const frame of rawFrames) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base: any = Jimp.fromBitmap({ data: frame.pixels, width: frame.width, height: frame.height });
    base.cover({ w: KEY_SIZE, h: KEY_SIZE });
    if (monitorBadge) base.composite(monitorBadge, KEY_SIZE - monitorBadge.width - 2, 2);
    if (logo) base.composite(logo, 2, KEY_SIZE - logo.height - 2);
    const buf = await base.getBuffer("image/png");
    result.push({ png: "data:image/png;base64," + buf.toString("base64"), delay: frame.delay });
  }

  return result;
}
