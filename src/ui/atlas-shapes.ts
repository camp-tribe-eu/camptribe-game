// GAME-250 · контури силуетів місць і пунктир маршруту на мапі Атласу (SVG-дані в atlas-shapes.json, не тексти). Малюються кодом: ні файлу, ні ліцензії.
import data from './atlas-shapes.json';

export const SILHOUETTE_PATHS: Readonly<Record<string, string>> = data.silhouettes;
export const ROUTE_PATH: string = data.route;
