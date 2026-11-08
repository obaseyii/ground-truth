import type { Market } from "../types";
import { getDb } from "./client";

export function listMarkets(): Market[] {
  return getDb()
    .prepare("SELECT id, name, lat, lon, radius_m FROM markets ORDER BY name")
    .all() as unknown as Market[];
}

export function getMarket(id: string): Market | undefined {
  return getDb()
    .prepare("SELECT id, name, lat, lon, radius_m FROM markets WHERE id = ?")
    .get(id) as unknown as Market | undefined;
}

export function upsertMarket(m: Market): void {
  getDb()
    .prepare(
      `INSERT INTO markets (id, name, lat, lon, radius_m) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, lat = excluded.lat,
         lon = excluded.lon, radius_m = excluded.radius_m`,
    )
    .run(m.id, m.name, m.lat, m.lon, m.radius_m);
}
