import streamDeck from "@elgato/streamdeck";
import { existsSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { getPreviewBase64FromDir } from "./getPreviewBase64";

export type PlaylistItemDetails = {
  id: string;
  title: string;
  preview: string | null;
};

export function getPlaylistItemDetails(itemPaths: string[]): PlaylistItemDetails[] {
  return itemPaths.map((itemPath) => {
    const dir = dirname(itemPath);
    const id = basename(dir);
    let title = id;

    const projectFile = join(dir, "project.json");
    if (existsSync(projectFile)) {
      try {
        const proj = JSON.parse(readFileSync(projectFile, "utf-8"));
        title = proj.title || proj.name || id;
      } catch (e) {
        streamDeck.logger.error(`Error parsing project file ${projectFile}: ${e}`);
      }
    }

    return { id, title, preview: getPreviewBase64FromDir(dir) };
  });
}
