import streamDeck from "@elgato/streamdeck";
import { Jimp } from "jimp";
import { dirname } from "path";
import { KEY_SIZE, LOGO_PATH_TEXT, LOGO_WIDTH_TEXT } from "../const/const";
import type { MonitorMode, OverlayDisplayMode } from "./buildKeyImage";
import { loadMonitorBadge, resolveOverlayDisplayMode } from "./buildKeyImage";
import { getPreviewBase64FromDir } from "./getPreviewBase64";

const BACKGROUND_COLOR = 0x1a1a1aff;
const GAP = 2;
const MAX_TILES = 4;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTile(itemPath: string): Promise<any | null> {
  const preview = getPreviewBase64FromDir(dirname(itemPath));
  if (!preview) return null;

  try {
    const raw = Buffer.from(preview.split(",")[1], "base64");
    return await Jimp.fromBuffer(raw);
  } catch (e) {
    streamDeck.logger.error(`Error decoding playlist preview for ${itemPath}: ${e}`);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function layoutTiles(base: any, tiles: any[]): void {
  const halfW = Math.floor((KEY_SIZE - GAP) / 2);
  const halfH = Math.floor((KEY_SIZE - GAP) / 2);
  const rightW = KEY_SIZE - halfW - GAP;
  const bottomH = KEY_SIZE - halfH - GAP;

  if (tiles.length === 1) {
    base.composite(tiles[0].cover({ w: KEY_SIZE, h: KEY_SIZE }), 0, 0);
    return;
  }

  if (tiles.length === 2) {
    base.composite(tiles[0].cover({ w: KEY_SIZE, h: halfH }), 0, 0);
    base.composite(tiles[1].cover({ w: KEY_SIZE, h: bottomH }), 0, halfH + GAP);
    return;
  }

  if (tiles.length === 3) {
    base.composite(tiles[0].cover({ w: halfW, h: halfH }), 0, 0);
    base.composite(tiles[1].cover({ w: rightW, h: halfH }), halfW + GAP, 0);
    base.composite(tiles[2].cover({ w: KEY_SIZE, h: bottomH }), 0, halfH + GAP);
    return;
  }

  const positions: [number, number][] = [
    [0, 0],
    [halfW + GAP, 0],
    [0, halfH + GAP],
    [halfW + GAP, halfH + GAP],
  ];
  const sizes: [number, number][] = [
    [halfW, halfH],
    [rightW, halfH],
    [halfW, bottomH],
    [rightW, bottomH],
  ];
  tiles.slice(0, MAX_TILES).forEach((tile, i) => {
    const [w, h] = sizes[i];
    const [x, y] = positions[i];
    base.composite(tile.cover({ w, h }), x, y);
  });
}

export async function buildPlaylistKeyImage(
  itemPaths: string[],
  overlayDisplayMode: OverlayDisplayMode = "logo-monitor",
  monitorMode?: MonitorMode,
  monitorIndex?: string,
): Promise<string> {
  const { showLogo, showMonitorBadge } = resolveOverlayDisplayMode(overlayDisplayMode);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: any = new Jimp({ width: KEY_SIZE, height: KEY_SIZE, color: BACKGROUND_COLOR });

  const tiles = (await Promise.all(itemPaths.slice(0, MAX_TILES).map(loadTile))).filter(
    (tile): tile is NonNullable<typeof tile> => tile !== null,
  );

  if (tiles.length > 0) layoutTiles(base, tiles);

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
