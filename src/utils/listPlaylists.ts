import streamDeck from "@elgato/streamdeck";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

export type PlaylistSettings = {
  delay: number;
  mode: string;
  order: string;
};

export type PlaylistInfo = {
  name: string;
  items: string[];
  settings: PlaylistSettings | null;
};

const BACKUP_FILE_PATTERN = /^config_\d{4}-\d{2}-\d{2}\.json$/;

function findLatestBackup(configBackupsPath: string): string | null {
  if (!existsSync(configBackupsPath)) return null;

  try {
    const backups = readdirSync(configBackupsPath)
      .filter((name) => BACKUP_FILE_PATTERN.test(name))
      .sort();
    if (backups.length === 0) return null;
    return join(configBackupsPath, backups[backups.length - 1]);
  } catch (e) {
    streamDeck.logger.error(`Error listing config backups at ${configBackupsPath}: ${e}`);
    return null;
  }
}

function extractPlaylists(configFile: string): PlaylistInfo[] {
  const raw = JSON.parse(readFileSync(configFile, "utf-8"));
  const userKey = Object.keys(raw).find((key) => !key.startsWith("?"));
  if (!userKey) return [];

  const playlists = raw[userKey]?.general?.playlists;
  if (!Array.isArray(playlists)) return [];

  return playlists
    .filter((p): p is { name: string; items?: unknown[]; settings?: Record<string, unknown> } => typeof p?.name === "string")
    .map((p) => {
      const s = p.settings;
      const settings: PlaylistSettings | null =
        s && typeof s.delay === "number" ? { delay: s.delay, mode: String(s.mode ?? ""), order: String(s.order ?? "") } : null;

      return {
        name: p.name,
        items: Array.isArray(p.items) ? p.items.filter((i): i is string => typeof i === "string") : [],
        settings,
      };
    });
}

export function listPlaylists(configBackupsPath: string): PlaylistInfo[] {
  const latestBackup = findLatestBackup(configBackupsPath);
  if (!latestBackup) {
    streamDeck.logger.warn(`No config backups found at: ${configBackupsPath}`);
    return [];
  }

  try {
    return extractPlaylists(latestBackup);
  } catch (e) {
    streamDeck.logger.error(`Error parsing config backup ${latestBackup}: ${e}`);
    return [];
  }
}
