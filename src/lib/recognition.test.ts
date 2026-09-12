import { test } from "node:test";
import assert from "node:assert/strict";
import { Candidate, Resource } from "./types.ts";
import { candidateToRow, rowToResource } from "./inventory.ts";

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return { id: "food", name: "芹菜", kind: "ingredient", count: null, uncertain: false, quantity: null, unit: null, ...overrides };
}

test("图片识别允许用估算克重填写散装食材，不再强制数量为空", () => {
  const parsed = Candidate.safeParse({
    id: "celery", name: "芹菜", kind: "ingredient", count: null,
    uncertain: false, quantity: 200, unit: "g",
  });
  assert.equal(parsed.success, true, "合理的估算克重应通过识别接口校验");
});

test("截图中旧格式识别结果自动补齐用量，可不编辑直接构造规划库存", () => {
  const foods = [
    candidate({ id: "celery", name: "芹菜" }),
    candidate({ id: "zucchini", name: "西葫芦", count: 1 }),
    candidate({ id: "papaya", name: "木瓜", count: 1 }),
    candidate({ id: "grapes", name: "青葡萄" }),
    candidate({ id: "sprouts", name: "青豆菜" }),
    candidate({ id: "garlic", name: "大蒜" }),
    candidate({ id: "oil", name: "食用油", kind: "consumable" }),
  ];
  const inventory = foods.map((c) => rowToResource(candidateToRow(Candidate.parse(c), "meal")));
  assert.equal(inventory.length, foods.length);
  assert.ok(inventory.every((r) => r !== null && Resource.safeParse(r).success));
  assert.equal(inventory.find((r) => r?.id === "oil")?.unit, "ml");
  assert.equal(inventory.find((r) => r?.id === "zucchini")?.quantity, 1);
  assert.equal(inventory.find((r) => r?.id === "celery")?.quantityEstimated, true);
});

test("图片的有效估算优先于参考份量，一瓶油使用 ml 而非 1 个", () => {
  const row = candidateToRow(candidate({ name: "食用油", kind: "consumable", count: 1, quantity: 150, unit: "ml" }), "meal");
  assert.equal(row.quantity, "150");
  assert.equal(row.unit, "ml");
  assert.equal(row.quantitySource, "image_estimate");
  assert.equal(Resource.parse(rowToResource(row)).quantityEstimated, true);
});

test("可数食材保留整数个数，用户修改用量不会被估算覆盖", () => {
  const counted = candidateToRow(candidate({ name: "鸡蛋", count: 2, quantity: 2, unit: "piece" }), "meal");
  assert.equal(counted.quantity, "2");
  assert.equal(counted.quantitySource, undefined);
  const estimated = candidateToRow(candidate(), "meal");
  const edited = rowToResource({ ...estimated, quantity: "125", quantitySource: undefined });
  assert.equal(edited?.quantity, 125);
  assert.equal(edited?.quantityEstimated, undefined);
});

test("粗估不能绕过无效数量、错误单位及整数约束", () => {
  for (const quantity of [0, -1, Infinity, NaN]) {
    assert.equal(Candidate.safeParse(candidate({ quantity, unit: "g" })).success, false);
  }
  assert.equal(Candidate.safeParse(candidate({ quantity: 1.5, unit: "piece" })).success, false);
  assert.equal(Candidate.safeParse(candidate({ quantity: 200, unit: null })).success, false);
  assert.equal(Candidate.safeParse(candidate({ unit: "g" })).success, false);
  assert.equal(Candidate.safeParse({ ...candidate(), quantity: 1, unit: "kg" }).success, false);
  for (const quantity of ["", "0", "-1", "Infinity", "NaN"]) {
    assert.equal(rowToResource({ ...candidateToRow(candidate(), "meal"), quantity }), null);
  }
  assert.equal(rowToResource({ ...candidateToRow(candidate(), "meal"), quantity: "1.5", unit: "piece" }), null);
});

test("不为旧物和未知数量的工具估重或默认数量", () => {
  const jar = candidateToRow(candidate({ name: "玻璃罐", kind: "material" }), "reuse");
  assert.equal(jar.quantity, "");
  assert.equal(jar.quantitySource, undefined);
  assert.equal(rowToResource(jar), null);
  const tool = candidateToRow(candidate({ name: "炒锅", kind: "tool" }), "meal");
  assert.equal(rowToResource(tool), null);
});

test("固体食材名称包含油或水时仍使用克重", () => {
  for (const name of ["油麦菜", "水蜜桃", "奶酪", "奶油"]) {
    assert.equal(candidateToRow(candidate({ name }), "meal").unit, "g", name);
  }
});

test("旧响应中的瓶碗计数不会把油和米变成按个计量", () => {
  const oil = candidateToRow(candidate({ name: "食用油", kind: "consumable", count: 1 }), "meal");
  assert.equal(oil.unit, "ml");
  assert.equal(oil.quantitySource, "reference_estimate");
  assert.equal(candidateToRow(candidate({ name: "生白米", count: 1 }), "meal").unit, "g");
});
