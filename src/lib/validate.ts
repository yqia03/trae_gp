import type { Constraints, MealData, Resource, ReuseData, Use } from "./types";

const EPS = 1e-6;

function norm(name: string): string {
  return name.trim().toLowerCase().replace(/[\s　]/g, "");
}

const SYNONYMS: string[][] = [
  ["蚝油", "蚝汁"],
  ["胶水", "白胶", "胶粘剂"],
  ["胶带", "胶布"],
  ["食盐", "盐", "精盐"],
  ["食用油", "油", "食油"],
  ["鸡蛋", "蛋"],
];

function nameBlocked(target: string, blocked: string[]): boolean {
  const t = norm(target);
  if (!t) return false;
  for (const b of blocked) {
    const nb = norm(b);
    if (!nb) continue;
    if (t === nb || t.includes(nb) || nb.includes(t)) return true;
    for (const group of SYNONYMS) {
      const g = group.map(norm);
      if (g.includes(nb) && g.some((x) => t === x || t.includes(x) || x.includes(t))) return true;
    }
  }
  return false;
}

function checkUses(
  uses: Use[],
  tools: string[],
  extras: Resource[],
  inventory: Resource[],
  constraints: Constraints,
  excludedExtras: string[],
  scope: string,
  out: string[],
) {
  const invById = new Map(inventory.map((r) => [r.id, r]));
  const extraById = new Map(extras.map((r) => [r.id, r]));

  // extras shape
  for (const ex of extras) {
    if (ex.available) out.push(`${scope}:补购项 ${ex.name} 不能标为已有`);
    if (ex.kind === "tool") out.push(`${scope}:工具不能进入补购清单`);
    if (nameBlocked(ex.name, excludedExtras)) out.push(`${scope}:补购项 ${ex.name} 在排除列表中`);
    if (nameBlocked(ex.name, constraints.dietaryAvoidances)) out.push(`${scope}:补购项 ${ex.name} 违反忌口`);
    if (ex.unit === "piece" && !Number.isInteger(ex.quantity)) out.push(`${scope}:${ex.name} 按个必须为整数`);
  }
  const extraCap = Math.min(constraints.maxExtras, 8);
  if (extras.length > extraCap) {
    out.push(`${scope}:补购种类 ${extras.length} 超出上限 ${extraCap}`);
  }

  // per-resource conservation
  const used = new Map<string, number>();
  for (const u of uses) {
    const res = invById.get(u.resourceId) ?? extraById.get(u.resourceId);
    if (!res) {
      out.push(`${scope}:引用了不存在的资源 ${u.resourceId}`);
      continue;
    }
    if (invById.has(u.resourceId) && !res.available) {
      out.push(`${scope}:${res.name} 未确认拥有，不能使用`);
    }
    if (res.kind === "tool") {
      out.push(`${scope}:工具 ${res.name} 不能计入消耗`);
    }
    if (u.unit !== res.unit) {
      out.push(`${scope}:${res.name} 用量单位 ${u.unit} 与库存单位 ${res.unit} 不一致`);
    }
    if (u.unit === "piece" && !Number.isInteger(u.quantity)) {
      out.push(`${scope}:${res.name} 按个用量必须为整数`);
    }
    if (nameBlocked(res.name, constraints.dietaryAvoidances)) {
      out.push(`${scope}:${res.name} 违反忌口`);
    }
    if (nameBlocked(res.name, excludedExtras)) {
      out.push(`${scope}:${res.name} 在排除列表中`);
    }
    used.set(u.resourceId, (used.get(u.resourceId) ?? 0) + u.quantity);
  }
  for (const [id, qty] of used) {
    const res = invById.get(id) ?? extraById.get(id);
    if (res && qty > res.quantity + EPS) {
      out.push(`${scope}:${res.name} 用量 ${qty}${res.unit} 超过可用 ${res.quantity}${res.unit}`);
    }
  }

  // tools
  for (const tid of tools) {
    const res = invById.get(tid);
    if (!res) out.push(`${scope}:引用了不存在的工具 ${tid}`);
    else if (res.kind !== "tool") out.push(`${scope}:${res.name} 不是工具，不能作为工具引用`);
    else if (!res.available) out.push(`${scope}:工具 ${res.name} 未确认拥有`);
  }
}

function checkSubstitutions(
  subs: { state: string; replacementResourceIds: string[]; requiresReplan: boolean }[],
  inventory: Resource[],
  scope: string,
  out: string[],
) {
  const invById = new Map(inventory.map((r) => [r.id, r]));
  for (const s of subs) {
    for (const rid of s.replacementResourceIds) {
      const res = invById.get(rid);
      if (!res) out.push(`${scope}:替代引用了不存在的资源 ${rid}`);
      else if (!res.available) out.push(`${scope}:替代资源 ${res.name} 未确认拥有`);
    }
    if (s.state === "suggested" && !s.requiresReplan) out.push(`${scope}:suggested 替代必须 requiresReplan=true`);
    if (s.state === "applied" && s.requiresReplan) out.push(`${scope}:applied 替代必须 requiresReplan=false`);
  }
}

export function validateMealData(
  data: MealData,
  inventory: Resource[],
  constraints: Constraints,
  excludedExtras: string[],
): string[] {
  const out: string[] = [];
  const dishes = data.menu.dishes;
  const ids = new Set<string>();
  for (const d of dishes) {
    if (ids.has(d.id)) out.push(`菜品 id 重复:${d.id}`);
    ids.add(d.id);
  }
  if (dishes.length !== 3) out.push(`菜单必须恰好 3 道，当前 ${dishes.length} 道`);
  const staples = dishes.filter((d) => d.role === "staple").length;
  const sides = dishes.filter((d) => d.role === "side").length;
  if (staples !== 1 || sides !== 2) out.push(`菜单需 1 主食 + 2 菜，当前 ${staples} 主食 ${sides} 菜`);
  const people = constraints.people ?? 2;
  for (const d of dishes) {
    if (d.servings !== people) out.push(`${d.name} 份数 ${d.servings} 与人数 ${people} 不一致`);
    if (d.steps.length === 0) out.push(`${d.name} 缺少步骤`);
  }

  // whole-meal conservation: all dish uses + global extras
  const allUses = dishes.flatMap((d) => d.uses);
  const allTools = [...new Set(dishes.flatMap((d) => d.tools))];
  checkUses(allUses, allTools, data.extras, inventory, constraints, excludedExtras, "整餐", out);
  checkSubstitutions(data.substitutions, inventory, "整餐", out);

  if (data.estimatedMinutes > constraints.maxMinutes + EPS) {
    out.push(`估时 ${data.estimatedMinutes} 分钟超过目标 ${constraints.maxMinutes} 分钟`);
  }
  const dishIds = new Set(dishes.map((d) => d.id));
  let lastEnd = 0;
  for (const t of data.timeline) {
    if (t.endMinute <= t.startMinute) out.push(`时间线条目结束不晚于开始:${t.action}`);
    for (const id of t.dishIds) if (!dishIds.has(id)) out.push(`时间线引用不存在的菜品 ${id}`);
    for (const id of t.toolIds) {
      const res = inventory.find((r) => r.id === id);
      if (!res || res.kind !== "tool" || !res.available) out.push(`时间线引用不可用工具 ${id}`);
    }
    lastEnd = Math.max(lastEnd, t.endMinute);
  }
  if (data.timeline.length > 0 && Math.abs(lastEnd - data.estimatedMinutes) > EPS) {
    out.push(`估时 ${data.estimatedMinutes} 与时间线最晚结束 ${lastEnd} 不一致`);
  }
  return out;
}

export function validateReuseData(
  data: ReuseData,
  inventory: Resource[],
  constraints: Constraints,
  excludedExtras: string[],
): string[] {
  const out: string[] = [];
  if (data.plans.length < 1 || data.plans.length > 2) {
    out.push(`方案数必须为 1–2，当前 ${data.plans.length}`);
  }
  const ids = new Set<string>();
  for (const p of data.plans) {
    if (ids.has(p.id)) out.push(`方案 id 重复:${p.id}`);
    ids.add(p.id);
    // each mutually-exclusive plan accounted independently
    checkUses(p.uses, p.tools, p.extras, inventory, constraints, excludedExtras, `方案「${p.title}」`, out);
    if (p.estimatedMinutes > constraints.maxMinutes + EPS) {
      out.push(`方案「${p.title}」估时 ${p.estimatedMinutes} 超过目标 ${constraints.maxMinutes} 分钟`);
    }
    if (p.steps.length === 0) out.push(`方案「${p.title}」缺少步骤`);
  }
  checkSubstitutions(data.substitutions, inventory, "旧物", out);
  return out;
}

/** Sum uses per resource for a scope; returns map resourceId → used quantity. */
export function sumUses(uses: Use[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of uses) m.set(u.resourceId, (m.get(u.resourceId) ?? 0) + u.quantity);
  return m;
}
