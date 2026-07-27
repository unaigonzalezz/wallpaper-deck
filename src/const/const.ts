import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { detectWallpaperEngine } from '../utils/detectWallpaperEngine';

export const DETECTED = detectWallpaperEngine();

export const DEFAULT_ENGINE =
  DETECTED?.enginePath ?? "C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe";
export const DEFAULT_BASE =
  DETECTED?.basePath ?? "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\431960";
export const DEFAULT_CONFIG_BACKUPS = join(dirname(DEFAULT_ENGINE), "config_backups");

export const LOGO_PATH_TEXT = join(dirname(fileURLToPath(import.meta.url)), "../imgs/wallpaper-deck-logo.png");

const MONITOR_IMGS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../imgs/monitor");

export const MONITOR_INDEX_ICON_PATHS = [1, 2, 3, 4, 5].map((n) => join(MONITOR_IMGS_DIR, `monitor-${n}.png`));
export const MONITOR_UNKNOWN_ICON_PATH = join(MONITOR_IMGS_DIR, "monitor-x.png");
export const MONITOR_ALL_ICON_PATH = join(MONITOR_IMGS_DIR, "monitor-all.png");

export const KEY_SIZE = 72;

export const LOGO_WIDTH_TEXT = 68;

export const MONITOR_BADGE_WIDTH = 20;
