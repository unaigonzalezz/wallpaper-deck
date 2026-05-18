import streamDeck from "@elgato/streamdeck";
import { WallpaperChange } from './actions/change-wallpaper';
import { RandomWallpaper } from './actions/random-wallpaper';

streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new WallpaperChange());
streamDeck.actions.registerAction(new RandomWallpaper());

streamDeck.connect();
