import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMealData, validateReuseData } from "./validate.ts";
import type { Constraints, MealData, Resource, ReuseData } from "./types.ts";

const inv: Resource[] = [
  { id: "rice", name: "生白米", quantity: 160, unit: "g", kind: "ingredient", available: true },
  { id: "egg", name: "鸡蛋", quantity: 2, unit: "piece", kind: "ingredient", available: true },
  { id: "oil", name: "食用油", quantity: 20, unit: "ml", kind: "consumable", available: true },
  { id: "wok", name: "炒锅", quantity: 1, unit: "piece", kind: "tool", available: true },
];
const base: Constraints = { people: 2, maxMinutes: 30, dietaryAvoidances: [], preferences: [], maxExtras: 0, equipmentNotes: [] };

function meal(overrides: Partial<MealData> = {}): MealData {
  const dish = (id: string, role: "staple" | "side", uses: { resourceId: string; quantity: number; unit: "g" | "ml" | "piece" }[]) => ({
    id, name: id, role, servings: 2, uses, tools: [] as string[],
    steps: [{ id: "s1", text: "做", resourceIds: [] as string[], minutes: 5 }],
  });
  return {
    menu: { dishes: [
      dish("a", "staple", [{ resourceId: "rice", quantity: 160, unit: "g" }]),
      dish("b", "side", [{ resourceId: "egg", quantity: 1, unit: "piece" }, { resourceId: "oil", quantity: 10, unit: "ml" }]),
      dish("c", "side", [{ resourceId: "egg", quantity: 1, unit: "piece" }, { resourceId: "oil", quantity: 10, unit: "ml" }]),
    ] },
    timeline: [{ startMinute: 0, endMinute: 20, action: "做", dishIds: ["a", "b", "c"], toolIds: [] }],
    extras: [], substitutions: [], estimatedMinutes: 20, assumptions: [],
    ...overrides,
  };
}

test("合法菜单通过守恒校验", () => {
  assert.deepEqual(validateMealData(meal(), inv, base, []), []);
});

test("同一批鸡蛋不能被两道菜重复超额分配", () => {
  const m = meal();
  m.menu.dishes[1].uses[0].quantity = 2; // b 用 2 个 + c 用 1 个 = 3 > 2
  const v = validateMealData(m, inv, base, []);
  assert.ok(v.some((x) => x.includes("鸡蛋")), v.join(";"));
});

test("maxExtras=0 时不允许补购项", () => {
  const m = meal({ extras: [{ id: "x", name: "蚝油", quantity: 10, unit: "ml", kind: "consumable", available: false }] });
  const v = validateMealData(m, inv, base, []);
  assert.ok(v.some((x) => x.includes("超出上限")), v.join(";"));
});

test("忌口食材不能出现在用量中", () => {
  const m = meal();
  const c = { ...base, dietaryAvoidances: ["鸡蛋"] };
  const v = validateMealData(m, inv, c, []);
  assert.ok(v.some((x) => x.includes("忌口")), v.join(";"));
});

test("排除项不能成为补购", () => {
  const c = { ...base, maxExtras: 2 };
  const m = meal({ extras: [{ id: "x", name: "胶水", quantity: 5, unit: "ml", kind: "consumable", available: false }] });
  const v = validateMealData(m, inv, c, ["胶水"]);
  assert.ok(v.some((x) => x.includes("排除")), v.join(";"));
});

test("piece 单位必须整数", () => {
  const m = meal();
  m.menu.dishes[1].uses[0].quantity = 1.5;
  const v = validateMealData(m, inv, base, []);
  assert.ok(v.some((x) => x.includes("整数")), v.join(";"));
});

test("估时不能超过目标时间", () => {
  const m = meal({ estimatedMinutes: 45, timeline: [{ startMinute: 0, endMinute: 45, action: "做", dishIds: ["a", "b", "c"], toolIds: [] }] });
  const v = validateMealData(m, inv, base, []);
  assert.ok(v.some((x) => x.includes("超过目标")), v.join(";"));
});

test("reuse 两案互斥:同资源分别占用不超量即合法", () => {
  const rinv: Resource[] = [
    { id: "jar", name: "玻璃罐", quantity: 1, unit: "piece", kind: "material", available: true },
    { id: "cloth", name: "棉布", quantity: 1, unit: "piece", kind: "material", available: true },
  ];
  const data: ReuseData = {
    plans: [
      { id: "p1", title: "一", uses: [{ resourceId: "jar", quantity: 1, unit: "piece" }, { resourceId: "cloth", quantity: 1, unit: "piece" }], tools: [], steps: [{ id: "s", text: "做", resourceIds: [], minutes: 5 }], extras: [], estimatedMinutes: 5, checks: [] },
      { id: "p2", title: "二", uses: [{ resourceId: "jar", quantity: 1, unit: "piece" }], tools: [], steps: [{ id: "s", text: "做", resourceIds: [], minutes: 5 }], extras: [], estimatedMinutes: 5, checks: [] },
    ],
    substitutions: [], assumptions: [],
  };
  assert.deepEqual(validateReuseData(data, rinv, base, []), []);
});

test("reuse 单案超量被拒绝", () => {
  const rinv: Resource[] = [{ id: "jar", name: "玻璃罐", quantity: 1, unit: "piece", kind: "material", available: true }];
  const data: ReuseData = {
    plans: [{ id: "p1", title: "一", uses: [{ resourceId: "jar", quantity: 2, unit: "piece" }], tools: [], steps: [{ id: "s", text: "做", resourceIds: [], minutes: 5 }], extras: [], estimatedMinutes: 5, checks: [] }],
    substitutions: [], assumptions: [],
  };
  const v = validateReuseData(data, rinv, base, []);
  assert.ok(v.some((x) => x.includes("超过可用")), v.join(";"));
});

test("工具不能计入消耗", () => {
  const m = meal();
  m.menu.dishes[0].uses.push({ resourceId: "wok", quantity: 1, unit: "piece" });
  const v = validateMealData(m, inv, base, []);
  assert.ok(v.some((x) => x.includes("工具") && x.includes("消耗")), v.join(";"));
});
