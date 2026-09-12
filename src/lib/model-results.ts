import { z } from "zod";
import { Candidate, Constraints, envelope, MealData, Mode, ModelPayload, Resource, ReuseData } from "./types.ts";
import type { Envelope } from "./types.ts";
import { validateMealData, validateReuseData } from "./validate.ts";

export const PlanInput = z.object({
  mode: Mode,
  inventory: z.array(Resource).min(1),
  inventoryConfirmed: z.literal(true),
  constraints: Constraints,
  excludedExtras: z.array(z.string()).default([]),
});
export type PlanInput = z.infer<typeof PlanInput>;

function parsePayload(text: string) {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("模型返回的内容不是有效 JSON，请重试。"); }
  const parsed = ModelPayload.safeParse(value);
  if (!parsed.success) throw new Error("模型返回结构无效，请重试。");
  return parsed.data;
}

export function recognitionEnvelope(text: string, mode: Mode, source: "gemini" | "custom" = "gemini"): Envelope<{ candidates: Candidate[] }> {
  const payload = parsePayload(text);
  let candidates: Candidate[] = [];
  if (payload.data !== null) {
    const parsed = z.object({ candidates: z.array(Candidate) }).safeParse(payload.data);
    if (!parsed.success) throw new Error("识别结果未通过数量与结构校验，请重试。");
    const seen = new Set<string>();
    candidates = parsed.data.candidates.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }
  if (payload.status === "ready" && candidates.length === 0) throw new Error("模型未返回可识别的物品，请换图或手动输入。");
  return envelope(mode, { ...payload, source, data: { candidates } });
}

export function planEnvelope(text: string, input: PlanInput, source: "gemini" | "custom" = "gemini"): Envelope<MealData | ReuseData> {
  const checked = PlanInput.safeParse(input);
  if (!checked.success) throw new Error("输入未通过校验：请确认库存数量、单位与确认状态。");
  const { mode, inventory, constraints, excludedExtras } = checked.data;
  if (new Set(inventory.map((r) => r.id)).size !== inventory.length || inventory.some((r) => r.unit === "piece" && !Number.isInteger(r.quantity))) {
    throw new Error("库存存在重复编号或非整数个数，请调整后重试。");
  }
  const payload = parsePayload(text);
  if (payload.status !== "ready") return envelope<MealData | ReuseData>(mode, { ...payload, source, data: null });
  const parsed = (mode === "meal" ? MealData : ReuseData).safeParse(payload.data);
  if (!parsed.success) throw new Error("生成结果未通过结构校验，请重新生成。");
  const violations = mode === "meal"
    ? validateMealData(parsed.data as MealData, inventory, constraints, excludedExtras)
    : validateReuseData(parsed.data as ReuseData, inventory, constraints, excludedExtras);
  if (violations.length) throw new Error(`生成结果未通过资源校验：${violations[0]}。请重试或调整输入。`);
  return envelope(mode, { ...payload, source, data: parsed.data });
}
