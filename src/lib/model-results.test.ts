import { test } from "node:test";
import assert from "node:assert/strict";
import { planEnvelope, recognitionEnvelope } from "./model-results.ts";

const input = {
  mode: "reuse" as const,
  inventory: [{ id: "box", name: "纸盒", quantity: 1, unit: "piece" as const, kind: "material" as const, available: true }],
  inventoryConfirmed: true as const,
  constraints: { maxMinutes: 30, dietaryAvoidances: [], preferences: [], maxExtras: 0, equipmentNotes: [] },
  excludedExtras: [],
};
const response = {
  status: "ready", questions: [], warnings: [],
  data: { plans: [{ id: "p1", title: "收纳盒", uses: [{ resourceId: "box", quantity: 1, unit: "piece" }], tools: [], steps: [{ id: "s1", text: "整理后放置物品", resourceIds: ["box"], minutes: 2 }], extras: [], estimatedMinutes: 2, checks: [] }], substitutions: [], assumptions: [] },
};

test("自定义与服务端响应复用结构和资源校验且来源准确", () => {
  assert.equal(planEnvelope(JSON.stringify(response), input, "custom").source, "custom");
  assert.equal(planEnvelope(JSON.stringify(response), input).source, "gemini");
  assert.throws(() => planEnvelope("not JSON", input, "custom"), /JSON/);
  assert.throws(() => planEnvelope(JSON.stringify({ ...response, data: {} }), input, "custom"), /结构/);
  const overuse = structuredClone(response);
  overuse.data.plans[0].uses[0].quantity = 2;
  assert.throws(() => planEnvelope(JSON.stringify(overuse), input, "custom"), /资源校验/);
});

test("模型缺信息或不可行不能被标成成功", () => {
  const result = planEnvelope(JSON.stringify({ status: "needs_info", data: response.data, questions: ["需要什么用途？"], warnings: [] }), input, "custom");
  assert.equal(result.status, "needs_info");
  assert.equal(result.data, null);
});

test("识别结果仍拒绝非法估量并保留自定义来源", () => {
  const candidate = { id: "rice", name: "大米", kind: "ingredient", quantity: 160, unit: "g", count: null, uncertain: false };
  const valid = { status: "ready", data: { candidates: [candidate] }, warnings: [], questions: [] };
  assert.equal(recognitionEnvelope(JSON.stringify(valid), "meal", "custom").source, "custom");
  assert.throws(() => recognitionEnvelope(JSON.stringify({ ...valid, data: { candidates: [{ ...candidate, quantity: -1 }] } }), "meal", "custom"), /校验/);
});
