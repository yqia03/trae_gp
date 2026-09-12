import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPantry, PANTRY_STORAGE_KEY, readPantry, writePantry } from "./pantry.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test("常备仓库保存增删、改量及是否使用，下次读取保留", () => {
  const store = storage();
  const items = defaultPantry().filter((p) => p.name !== "食盐");
  items[0] = { ...items[0], quantity: "50", included: false };
  items.push({ id: "custom-vinegar", name: "米醋", kind: "consumable", quantity: "20", unit: "ml", uncertain: false, included: true });
  writePantry(store, items);
  assert.deepEqual(readPantry(store), items);
});

test("用户删光仓库后不会恢复默认油盐", () => {
  const store = storage();
  writePantry(store, []);
  assert.deepEqual(readPantry(store), []);
});

test("新用户读取默认项不会写入，空白草稿可保存", () => {
  const store = storage();
  assert.deepEqual(readPantry(store), defaultPantry());
  assert.equal(store.getItem(PANTRY_STORAGE_KEY), null);
  const draft = { ...defaultPantry()[0], name: "", quantity: "", included: false };
  writePantry(store, [draft]);
  assert.deepEqual(readPantry(store), [draft]);
});

test("损坏存储和写入失败交给界面处理，不静默覆盖原数据", () => {
  const store = storage();
  store.setItem(PANTRY_STORAGE_KEY, "invalid-json");
  assert.throws(() => readPantry(store));
  assert.equal(store.getItem(PANTRY_STORAGE_KEY), "invalid-json");
  assert.throws(() => writePantry({ setItem() { throw new Error("storage unavailable"); } }, []));
});

test("持久化只保留仓库字段，不保存附带图片", () => {
  const store = storage();
  writePantry(store, [{ ...defaultPantry()[0], ...{ image: "must-not-be-saved" } }]);
  assert.ok(!store.getItem(PANTRY_STORAGE_KEY)?.includes("must-not-be-saved"));
});
