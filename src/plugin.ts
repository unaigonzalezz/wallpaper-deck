import streamDeck from "@elgato/streamdeck";
import { WallpaperChange } from './actions/change-wallpaper';

streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new WallpaperChange());

streamDeck.connect();
