import type { Candidate, Kind, Mode, Resource, Unit } from "./types.ts";

export interface InventoryRow {
  id: string;
  name: string;
  kind: Kind;
  quantity: string;
  unit: Unit;
  uncertain: boolean;
  quantitySource?: "image_estimate" | "reference_estimate";
}

// Used only when a recognized food has no model estimate. These are editable
// planning portions, not measurements or a substitute for image recognition.
function referencePortion(name: string, kind: Kind): { quantity: number; unit: Unit } {
  if (/^(食用油|植物油|橄榄油|花生油|菜籽油|玉米油|葵花籽油|大豆油|芝麻油|香油|油|醋|米醋|白醋|陈醋|酱油|生抽|老抽|料酒)$/.test(name.trim())) return { quantity: 30, unit: "ml" };
  if (/^(水|清水|饮用水|烹饪用水|牛奶|纯牛奶|鲜奶|豆奶|豆浆|椰奶|椰浆|果汁|橙汁|苹果汁)$/.test(name.trim())) return { quantity: 250, unit: "ml" };
  if (/盐/.test(name)) return { quantity: 5, unit: "g" };
  if (/蒜|姜|葱|辣椒|香菜/.test(name)) return { quantity: 20, unit: "g" };
  if (/糖|淀粉|胡椒|调味|酱/.test(name)) return { quantity: 10, unit: "g" };
  if (/豆苗|豆芽|豆菜|蘑菇|菌菇/.test(name)) return { quantity: 100, unit: "g" };
  if (/葡萄|提子|浆果/.test(name)) return { quantity: 250, unit: "g" };
  if (/米|面条|意面/.test(name)) return { quantity: 160, unit: "g" };
  return { quantity: kind === "consumable" ? 10 : 200, unit: "g" };
}

export function candidateToRow(candidate: Candidate, mode: Mode): InventoryRow {
  const row: InventoryRow = {
    id: candidate.id, name: candidate.name, kind: candidate.kind,
    quantity: "", unit: mode === "meal" ? "g" : "piece", uncertain: candidate.uncertain,
  };
  const canEstimate = mode === "meal" && (candidate.kind === "ingredient" || candidate.kind === "consumable");
  if (canEstimate && candidate.quantity !== null && candidate.unit !== null) {
    return {
      ...row, quantity: String(candidate.quantity), unit: candidate.unit,
      ...(candidate.unit === "piece" && candidate.quantity === candidate.count
        ? {} : { quantitySource: "image_estimate" as const }),
    };
  }
  const estimate = canEstimate ? referencePortion(candidate.name, candidate.kind) : null;
  const countIsContainer = estimate?.unit === "ml" || /^(生白米|生米|大米|白米|米饭|面粉|面条|意面|白糖|食盐)$/.test(candidate.name.trim());
  if (candidate.count !== null && !(canEstimate && countIsContainer)) {
    return { ...row, quantity: String(candidate.count), unit: "piece" };
  }
  if (estimate) {
    return { ...row, quantity: String(estimate.quantity), unit: estimate.unit, quantitySource: "reference_estimate" };
  }
  return row;
}

export function rowToResource(row: InventoryRow): Resource | null {
  const quantity = Number(row.quantity);
  if (!row.name.trim() || !Number.isFinite(quantity) || quantity <= 0) return null;
  if (row.unit === "piece" && !Number.isInteger(quantity)) return null;
  return {
    id: row.id, name: row.name.trim(), quantity, unit: row.unit, kind: row.kind, available: true,
    ...(row.quantitySource ? { quantityEstimated: true } : {}),
  };
}
