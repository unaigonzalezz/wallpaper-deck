import streamDeck from "@elgato/streamdeck";
import { WallpaperChange } from './actions/change-wallpaper';
import { LoadPlaylist } from './actions/load-playlist';
import { RandomWallpaper } from './actions/random-wallpaper';

streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new WallpaperChange());
streamDeck.actions.registerAction(new RandomWallpaper());
streamDeck.actions.registerAction(new LoadPlaylist());

streamDeck.connect();
