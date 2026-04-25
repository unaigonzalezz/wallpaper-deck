import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { detectWallpaperEngine } from '../utils/detectWallpaperEngine';

export const DETECTED = detectWallpaperEngine();

export const DEFAULT_ENGINE =
  DETECTED?.enginePath ?? "C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe";
export const DEFAULT_BASE =
  DETECTED?.basePath ?? "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\431960";

export const LOGO_PATH_TEXT = join(dirname(fileURLToPath(import.meta.url)), "../imgs/wallpaper-deck-logo.png");
export const LOGO_PATH = join(dirname(fileURLToPath(import.meta.url)), "../imgs/logo.png");

export const KEY_SIZE = 72;

export const LOGO_WIDTH_TEXT = 68;
export const LOGO_WIDTH = 25;
