import { z } from "zod";
import { Unit } from "./types.ts";
import type { InventoryRow as Row } from "./inventory.ts";

export interface PantryItem extends Row { included: boolean; }

export const defaultPantry = (): PantryItem[] => [
  { id: "p-oil", name: "食用油", kind: "consumable", quantity: "30", unit: "ml", uncertain: false, included: true },
  { id: "p-salt", name: "食盐", kind: "consumable", quantity: "5", unit: "g", uncertain: false, included: true },
  { id: "p-water", name: "烹饪用水", kind: "consumable", quantity: "500", unit: "ml", uncertain: false, included: true },
  { id: "p-soy", name: "生抽", kind: "consumable", quantity: "15", unit: "ml", uncertain: false, included: false },
  { id: "p-sugar", name: "白糖", kind: "consumable", quantity: "10", unit: "g", uncertain: false, included: false },
  { id: "p-starch", name: "淀粉", kind: "consumable", quantity: "10", unit: "g", uncertain: false, included: false },
  { id: "p-scallion", name: "葱", kind: "consumable", quantity: "1", unit: "piece", uncertain: false, included: false },
  { id: "p-ginger", name: "姜", kind: "consumable", quantity: "10", unit: "g", uncertain: false, included: false },
  { id: "p-garlic", name: "蒜", kind: "consumable", quantity: "3", unit: "piece", uncertain: false, included: false },
];

export const PANTRY_STORAGE_KEY = "jdqc.pantry.v1";

// Persist drafts as strings; validate positive quantities only when planning.
const StoredPantry = z.array(z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.literal("consumable"),
  quantity: z.string(),
  unit: Unit,
  uncertain: z.boolean(),
  included: z.boolean(),
})).refine((items) => new Set(items.map((item) => item.id)).size === items.length);

type PantryStorage = Pick<Storage, "getItem" | "setItem">;

export function readPantry(storage: Pick<PantryStorage, "getItem">): PantryItem[] {
  const saved = storage.getItem(PANTRY_STORAGE_KEY);
  return saved === null ? defaultPantry() : StoredPantry.parse(JSON.parse(saved));
}

export function writePantry(storage: Pick<PantryStorage, "setItem">, items: PantryItem[]): void {
  storage.setItem(PANTRY_STORAGE_KEY, JSON.stringify(StoredPantry.parse(items)));
}
