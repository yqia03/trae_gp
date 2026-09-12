"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, ChefHat, Copy, ImagePlus, Loader2, Package, Plus, RefreshCw, Sparkles, Trash2, X,
} from "lucide-react";
import type { Candidate, Constraints, Envelope, Kind, MealData, Mode, Resource, ReuseData, Unit, Use } from "@/lib/types";
import { defaultPantry, readPantry, writePantry, type PantryItem } from "@/lib/pantry";
import { candidateToRow, rowToResource, type InventoryRow as Row } from "@/lib/inventory";
import {
  DEMO_MEAL_IMAGE, DEMO_REUSE_IMAGE, demoGlueFixtureEnvelope, demoMealConstraints, demoMealEnvelope,
  demoMealInventory, demoReuseConstraints, demoReuseEnvelope, demoReuseInventory,
} from "@/lib/demo";

import { callCustomAI, validateCustomAIConfig, type CustomAIConfig } from "@/lib/custom-ai";
import { planEnvelope, recognitionEnvelope, type PlanInput } from "@/lib/model-results";
import { RECOGNIZE_SYSTEM, PLAN_SYSTEM } from "@/lib/prompts";
import { RECOGNIZE_SCHEMA, MEAL_PLAN_SCHEMA, REUSE_PLAN_SCHEMA } from "@/lib/jsonSchemas";

const uid = () => Math.random().toString(36).slice(2, 10);
const STATIC_HOST = process.env.NEXT_PUBLIC_DEMO_ONLY === "true";
const ASSET_BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";


const initialAPIConfig = (): CustomAIConfig => ({
  provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-3.8-flash", apiKey: "",
});
const sourceLabel = (source: Envelope<unknown>["source"]) => source === "demo" ? "固定演示样例" : source === "custom" ? "自定义 AI 实时生成" : "Gemini 实时生成";

async function imageData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("无法读取图片，请重新选择。"));
    reader.readAsDataURL(blob);
  });
}

const KIND_LABEL: Record<Kind, string> = {
  ingredient: "食材", material: "材料", consumable: "耗材", tool: "工具",
};
const UNIT_LABEL: Record<Unit, string> = { g: "g", ml: "ml", piece: "个" };

interface ImageState { url: string; demo: boolean; }
interface RecognizeState { phase: "idle" | "loading" | "error"; message?: string; }
interface PlanState { phase: "idle" | "loading" | "error"; message?: string; retryable?: boolean; }
interface StoredResult { envelope: Envelope<MealData | ReuseData>; version: number; }
type DemoTag = "meal" | "reuse" | "glue" | null;

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= 1.5 * 1024 * 1024) return blob;
  }
  throw new Error("too-large");
}

function computeLedger(inventory: Resource[], uses: Use[]) {
  const used = new Map<string, number>();
  for (const u of uses) used.set(u.resourceId, (used.get(u.resourceId) ?? 0) + u.quantity);
  return inventory
    .filter((r) => r.kind !== "tool")
    .map((r) => ({ resource: r, used: used.get(r.id) ?? 0, remaining: Math.round((r.quantity - (used.get(r.id) ?? 0)) * 100) / 100 }));
}

export default function Home() {
  const [apiDraft, setAPIDraft] = useState<CustomAIConfig>(initialAPIConfig);
  const [customAPI, setCustomAPI] = useState<CustomAIConfig | null>(null);
  const [apiStatus, setAPIStatus] = useState({ phase: "idle" as "idle" | "loading" | "success" | "error", message: "" });
  const [mode, setMode] = useState<Mode>("meal");
  const [image, setImage] = useState<ImageState | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [people, setPeople] = useState("2");
  const [maxMinutes, setMaxMinutes] = useState("30");
  const [avoidances, setAvoidances] = useState("");
  const [preferences, setPreferences] = useState("");
  const [onlyExisting, setOnlyExisting] = useState(true);
  const [pantryState, setPantryState] = useState(() => ({
    items: defaultPantry(), ready: false, message: "正在读取常备食材…", failed: false,
  }));
  const pantry = pantryState.items;

  useEffect(() => {
    let items = defaultPantry();
    let failed = false;
    try { items = readPantry(window.localStorage); } catch { failed = true; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore browser storage after hydration, without saving defaults over it.
    setPantryState({ items, ready: true, failed, message: failed
      ? "无法读取已保存的仓库，本次可继续编辑；修改后会尝试重新保存。"
      : "仅保存在此浏览器，下次打开自动带入。" });
  }, []);

  const setPantry = (items: PantryItem[]) => {
    let failed = false;
    try { writePantry(window.localStorage, items); } catch { failed = true; }
    setPantryState({ items, ready: true, failed, message: failed
      ? "暂时无法保存，当前编辑仍可使用；刷新后可能丢失。"
      : "已自动保存到此浏览器。" });
  };
  const [burners, setBurners] = useState("2");
  const [tools, setTools] = useState<Record<string, boolean>>({ "带盖煮饭锅": true, "炒锅": true, "刀与砧板": true });
  const [reuseTools, setReuseTools] = useState<Record<string, boolean>>({ "平稳桌面": true });
  const [recognize, setRecognize] = useState<RecognizeState>({ phase: "idle" });
  const [plan, setPlan] = useState<PlanState>({ phase: "idle" });
  const [result, setResult] = useState<StoredResult | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [demoTag, setDemoTag] = useState<DemoTag>(null);
  const [demoEdited, setDemoEdited] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set());
  const [excludedExtras, setExcludedExtras] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const [inputVersion, setInputVersion] = useState(0);
  const bump = useCallback(() => setInputVersion((v) => v + 1), []);
  const seq = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageBlob = useRef<Blob | null>(null);

  const stale = result !== null && result.version !== inputVersion;
  const resultSource = result?.envelope.source;

  const markEdited = useCallback(() => {
    bump();
    if (demoTag) setDemoEdited(true);
    setCheckedSteps(new Set());
  }, [bump, demoTag]);

  const editAPI = (patch: Partial<CustomAIConfig>) => {
    setAPIDraft((old) => ({ ...old, ...patch, ...(patch.baseUrl !== undefined || patch.provider !== undefined ? { apiKey: "" } : {}) }));
    setCustomAPI(null);
    setAPIStatus({ phase: "idle", message: "设置已修改，请重新启用接口。" });
    seq.current++;
    setRecognize({ phase: "idle" });
    setPlan({ phase: "idle" });
    markEdited();
  };

  const enableAPI = () => {
    try {
      setCustomAPI(validateCustomAIConfig(apiDraft));
      setAPIStatus({ phase: "idle", message: "自定义接口已启用；可测试连接或直接识别、生成。" });
      markEdited();
    } catch (error) {
      setAPIStatus({ phase: "error", message: error instanceof Error ? error.message : "接口设置无效。" });
    }
  };

  const testAPI = async () => {
    setAPIStatus({ phase: "loading", message: "正在测试连接…" });
    try {
      const config = validateCustomAIConfig(apiDraft);
      const text = await callCustomAI(config, {
        systemInstruction: '只输出 JSON 对象 {"ok":true}。', prompt: "测试结构化输出。",
        schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
      });
      if (JSON.parse(text)?.ok !== true) throw new Error("接口有响应，但未按要求返回 JSON；请确认模型支持结构化输出。");
      setCustomAPI(config);
      setAPIStatus({ phase: "success", message: "连接成功，接口已启用。图片识别还需模型支持图片输入。" });
      markEdited();
    } catch (error) {
      setAPIStatus({ phase: "error", message: error instanceof SyntaxError ? "接口有响应，但没有返回有效 JSON。" : error instanceof Error ? error.message : "连接测试失败。" });
    }
  };

  // ---------- 输入操作 ----------
  const onPickFile = async (f: File) => {
    setRecognize({ phase: "idle" });
    try {
      const blob = await compressImage(f);
      imageBlob.current = blob;
      setImage((old) => {
        if (old && !old.demo) URL.revokeObjectURL(old.url);
        return { url: URL.createObjectURL(blob), demo: false };
      });
      setDemoTag(null);
      markEdited();
    } catch {
      setRecognize({ phase: "error", message: "无法处理该图片（需 JPEG/PNG/WebP，压缩后仍超限），请换一张。" });
    }
  };

  const runRecognize = async () => {
    if (STATIC_HOST && !customAPI) {
      setRecognize({ phase: "error", message: "请先在“AI 接口设置”中启用自己的接口，或加载固定样例。" });
      return;
    }
    if (!imageBlob.current || recognize.phase === "loading" || plan.phase === "loading" || apiStatus.phase === "loading") return;
    const mySeq = ++seq.current;
    setRecognize({ phase: "loading" });
    try {
      let env: Envelope<{ candidates: Candidate[] }>;
      if (customAPI) {
        const output = await callCustomAI(customAPI, {
          systemInstruction: RECOGNIZE_SYSTEM,
          prompt: `mode=${mode}。请识别图片中的${mode === "meal" ? "食材" : "闲置物品与相关材料"}候选。`,
          schema: RECOGNIZE_SCHEMA,
          image: { mimeType: "image/jpeg", data: await imageData(imageBlob.current) },
        });
        env = recognitionEnvelope(output, mode, "custom");
      } else {
        const fd = new FormData();
        fd.append("image", new File([imageBlob.current], "upload.jpg", { type: "image/jpeg" }));
        fd.append("mode", mode);
        const res = await fetch("/api/recognize", { method: "POST", body: fd });
        env = (await res.json()) as Envelope<{ candidates: Candidate[] }>;
        if (!res.ok || env.error) throw new Error(env.error?.message ?? "识别失败，请重试。");
      }
      if (mySeq !== seq.current) return;
      const list = env.data?.candidates ?? [];
      setRows(list.map((c) => candidateToRow(c, mode)));
      setQuestions(env.questions);
      setDemoTag(null);
      setRecognize({ phase: "idle" });
      if (env.status === "needs_info" && list.length === 0) {
        setRecognize({ phase: "error", message: "未能识别出可靠候选，可换清晰图片或直接手动输入。" });
      }
      markEdited();
    } catch (error) {
      if (mySeq !== seq.current) return;
      setRecognize({ phase: "error", message: error instanceof Error ? error.message : "网络异常，识别未完成。输入已保留，可重试。" });
    }
  };

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? {
      ...r, ...patch,
      ...(patch.quantity !== undefined || patch.unit !== undefined ? { quantitySource: undefined } : {}),
    } : r)));
    markEdited();
  };

  const buildInventory = (): Resource[] | null => {
    const items: Resource[] = [];
    for (const r of rows) {
      const resource = rowToResource(r);
      if (!resource) return null;
      items.push(resource);
    }
    if (mode === "meal") {
      for (const p of pantry) {
        if (!p.included) continue;
        // A photographed pantry item is the same stock, not an extra portion.
        if (rows.some((r) => r.name.trim() === p.name.trim())) continue;
        const q = Number(p.quantity);
        if (!p.name.trim() || !Number.isFinite(q) || q <= 0) return null;
        if (p.unit === "piece" && !Number.isInteger(q)) return null;
        items.push({ id: p.id, name: p.name.trim(), quantity: q, unit: p.unit, kind: "consumable", available: true });
      }
      for (const [name, on] of Object.entries(tools)) {
        if (on) items.push({ id: `b-t-${name}`, name, quantity: 1, unit: "piece", kind: "tool", available: true });
      }
    } else {
      for (const [name, on] of Object.entries(reuseTools)) {
        if (on) items.push({ id: `b-rt-${name}`, name, quantity: 1, unit: "piece", kind: "tool", available: true });
      }
    }
    return items;
  };

  const runPlan = async (excluded: string[] = excludedExtras) => {
    if (STATIC_HOST && !customAPI) {
      setPlan({ phase: "error", message: "请先在“AI 接口设置”中启用自己的接口，即可使用真实 AI 生成。", retryable: false });
      return;
    }
    if (plan.phase === "loading" || recognize.phase === "loading" || apiStatus.phase === "loading") return;
    const inventory = buildInventory();
    if (!inventory || inventory.filter((r) => r.kind !== "tool").length === 0) {
      setPlan({ phase: "error", message: "请为每项资源填写正数数量（按个需为整数）后再生成。", retryable: false });
      return;
    }
    const mySeq = ++seq.current;
    const version = inputVersion;
    setPlan({ phase: "loading" });
    setQuestions([]);
    try {
      const constraints: Constraints = {
        people: mode === "meal" ? Math.max(1, parseInt(people) || 2) : undefined,
        maxMinutes: Math.max(1, parseInt(maxMinutes) || 30),
        dietaryAvoidances: avoidances.split(/[,，、\s]+/).filter(Boolean),
        preferences: preferences.split(/[,，、\s]+/).filter(Boolean),
        maxExtras: onlyExisting ? 0 : 8,
        equipmentNotes: mode === "meal" ? [`炉头数量:${burners}`] : [],
      };
      const request: PlanInput = { mode, inventory, inventoryConfirmed: true, constraints, excludedExtras: excluded };
      let env: Envelope<MealData | ReuseData>;
      if (customAPI) {
        const output = await callCustomAI(customAPI, {
          systemInstruction: PLAN_SYSTEM, prompt: JSON.stringify(request),
          schema: mode === "meal" ? MEAL_PLAN_SCHEMA : REUSE_PLAN_SCHEMA,
        });
        env = planEnvelope(output, request, "custom");
      } else {
        const res = await fetch("/api/plan", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
        });
        env = (await res.json()) as Envelope<MealData | ReuseData>;
        if (!res.ok || env.error) throw new Error(env.error?.message ?? "生成失败，请重试。");
      }
      if (mySeq !== seq.current) return;
      if (env.status === "needs_info") {
        setQuestions(env.questions);
        setPlan({ phase: "error", message: "还缺一些信息：请补充后重新生成。", retryable: true });
        return;
      }
      if (env.status !== "ready" || !env.data) {
        setPlan({ phase: "error", message: env.warnings[0] ?? "当前条件下无法成案，可调整人数、时间或资源后重试。", retryable: true });
        return;
      }
      setResult({ envelope: env, version });
      setCheckedSteps(new Set());
      setSelectedPlanId(env.mode === "reuse" ? (env.data as ReuseData).plans[0]?.id ?? null : null);
      setPlan({ phase: "idle" });
      if (demoTag) setDemoEdited(false);
      setDemoTag(null);
    } catch (error) {
      if (mySeq !== seq.current) return;
      setPlan({ phase: "error", message: error instanceof Error ? error.message : "网络异常，生成未完成。输入已保留，可重试。", retryable: true });
    }
  };

  // ---------- 固定样例 ----------
  const loadDemo = (which: "meal" | "reuse" | "glue") => {
    seq.current++;
    setRecognize({ phase: "idle" });
    setPlan({ phase: "idle" });
    setQuestions([]);
    setExcludedExtras([]);
    setDemoEdited(false);
    if (which === "meal") {
      setMode("meal");
      setImage({ url: DEMO_MEAL_IMAGE, demo: true });
      imageBlob.current = null;
      setRows(demoMealInventory.filter((r) => r.kind === "ingredient").map((r) => ({
        id: r.id, name: r.name, kind: r.kind, quantity: String(r.quantity), unit: r.unit, uncertain: false,
      })));
      setTools({ "带盖煮饭锅": true, "炒锅": true, "刀与砧板": true });
      setBurners("2");
      setPeople(String(demoMealConstraints.people ?? 2));
      setMaxMinutes(String(demoMealConstraints.maxMinutes));
      setResult({ envelope: demoMealEnvelope, version: 0 });
    } else {
      setMode("reuse");
      setImage({ url: DEMO_REUSE_IMAGE, demo: true });
      imageBlob.current = null;
      setRows(demoReuseInventory.filter((r) => r.kind !== "tool").map((r) => ({
        id: r.id, name: r.name, kind: r.kind, quantity: String(r.quantity), unit: r.unit, uncertain: false,
      })));
      setReuseTools({ "平稳桌面": true });
      setMaxMinutes(String(demoReuseConstraints.maxMinutes));
      const env = which === "glue" ? demoGlueFixtureEnvelope : demoReuseEnvelope;
      setResult({ envelope: env, version: 0 });
      setSelectedPlanId(env.data?.plans[0]?.id ?? null);
    }
    setDemoTag(which);
    setCheckedSteps(new Set());
    setInputVersion(0);
  };

  const excludeExtra = (name: string) => {
    const next = [...excludedExtras, name];
    setExcludedExtras(next);
    if (demoTag === "glue") {
      // 固定验收夹具：整体替换为免粘合成功参考
      setResult({ envelope: demoReuseEnvelope, version: 0 });
      setSelectedPlanId(demoReuseEnvelope.data?.plans[0]?.id ?? null);
      setCheckedSteps(new Set());
      setDemoTag("reuse");
      return;
    }
    markEdited();
    runPlan(next);
  };

  // ---------- 展示数据 ----------
  const mealData = result?.envelope.mode === "meal" && result.envelope.status === "ready" ? (result.envelope.data as MealData) : null;
  const reuseData = result?.envelope.mode === "reuse" && result.envelope.status === "ready" ? (result.envelope.data as ReuseData) : null;

  const inventoryNow = useMemo(() => demoTag === "meal" && !demoEdited ? demoMealInventory : buildInventory() ?? [], [rows, pantry, tools, reuseTools, mode, demoTag, demoEdited]); // eslint-disable-line react-hooks/exhaustive-deps
  const ledger = useMemo(() => {
    if (!result) return [];
    if (mealData) return computeLedger(inventoryNow, mealData.menu.dishes.flatMap((d) => d.uses));
    if (reuseData && selectedPlanId) {
      const p = reuseData.plans.find((x) => x.id === selectedPlanId);
      if (p) return computeLedger(inventoryNow, p.uses);
    }
    return [];
  }, [result, mealData, reuseData, selectedPlanId, inventoryNow]);

  const copyPlan = async () => {
    if (!result) return;
    const src = sourceLabel(result.envelope.source);
    const lines: string[] = [`【就地取材】来源:${src}`, `输入:${rows.map((r) => `${r.name}${r.quantitySource ? "约" : ""}${r.quantity}${UNIT_LABEL[r.unit]}`).join("、")}`];
    if (rows.some((r) => r.quantitySource)) lines.push("部分用量为估算，资源余量也按估算计算，可按实际份量调整。");
    if (mealData) {
      lines.push(`预计 ${mealData.estimatedMinutes} 分钟`);
      for (const d of mealData.menu.dishes) {
        lines.push(`\n■ ${d.name}(${d.role === "staple" ? "主食" : "菜"},${d.servings} 人份)`);
        lines.push(`用量:${d.uses.map((u) => `${inventoryNow.find((r) => r.id === u.resourceId)?.name ?? u.resourceId} ${u.quantity}${UNIT_LABEL[u.unit]}`).join("、")}`);
        d.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.text}`));
      }
      mealData.assumptions.forEach((a) => lines.push(`条件:${a}`));
    } else if (reuseData) {
      const p = reuseData.plans.find((x) => x.id === selectedPlanId) ?? reuseData.plans[0];
      if (p) {
        lines.push(`\n■ ${p.title}(约 ${p.estimatedMinutes} 分钟)`);
        p.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.text}`));
        p.checks.forEach((c) => lines.push(`检查:${c}`));
      }
    }
    result.envelope.warnings.forEach((w) => lines.push(`提示:${w}`));
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => () => { if (image && !image.demo) URL.revokeObjectURL(image.url); }, [image]);

  const extrasAll: Resource[] = mealData?.extras ?? (reuseData && selectedPlanId ? reuseData.plans.find((p) => p.id === selectedPlanId)?.extras ?? [] : []);

  // ---------- 渲染 ----------
  return (
    <div className="min-h-screen">
      {STATIC_HOST && <div className="px-6 py-3 bg-surface text-sm text-accenttext">GitHub Pages 在线版 · 配置自己的 AI 接口即可真实识别和生成；也可加载固定样例体验。</div>}
      {/* 顶栏 */}
      <header className="flex items-center justify-between px-6 h-16 border-b border-line">
        <div className="flex items-baseline gap-3">
          <span className="serif text-2xl font-bold">就地取材</span>
          <span className="text-secondary text-sm hidden sm:inline">把家里已有的，变成今天用得上的</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => loadDemo("meal")} className="min-h-11 px-4 rounded-full border border-borderctl text-sm text-secondary hover:text-cream">
            加载演示样例 · 晚餐
          </button>
          <button onClick={() => loadDemo("reuse")} className="min-h-11 px-4 rounded-full border border-borderctl text-sm text-secondary hover:text-cream">
            演示样例 · 旧物
          </button>
        </div>
      </header>

      {/* 横幅 */}
      <section className="relative h-[200px] overflow-hidden">
        <img src={`${ASSET_BASE}/assets/brand/brand-still-life.png`} alt="" className="absolute right-0 top-0 h-full w-2/3 object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/85 to-canvas/20" />
        <div className="relative h-full flex flex-col justify-center px-6 max-w-2xl">
          <h1 className="text-4xl font-bold leading-tight">把家里已有的，<br />变成今天用得上的</h1>
          <p className="text-secondary mt-2 text-sm">拍一张现有食材或闲置物，确认有什么、有多少，得到可执行的用量与步骤。主视觉为 AI 生成示例图。</p>
        </div>
      </section>

      {/* 场景切换 */}
      <div className="px-6 mt-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => { setMode("meal"); setResult(null); setRows([]); setImage(null); setDemoTag(null); setExcludedExtras([]); bump(); }}
          className={`min-h-11 px-5 rounded-full flex items-center gap-2 ${mode === "meal" ? "bg-cream text-canvas font-semibold" : "border border-borderctl text-secondary"}`}
        >
          <ChefHat size={18} /> 今晚吃什么
        </button>
        <button
          onClick={() => { setMode("reuse"); setResult(null); setRows([]); setImage(null); setDemoTag(null); setExcludedExtras([]); bump(); }}
          className={`min-h-11 px-5 rounded-full flex items-center gap-2 ${mode === "reuse" ? "bg-cream text-canvas font-semibold" : "border border-borderctl text-secondary"}`}
        >
          <Package size={18} /> 物品第二人生
        </button>
        <span className="text-secondary text-sm flex items-center gap-1"><Sparkles size={14} className="text-accent" /> 两个场景共享「巧用替代」:缺料时按已有资源重新规划</span>
      </div>

      {/* 工作区 */}
      <main className="px-6 py-6 grid grid-cols-1 lg:grid-cols-[38%_1fr] gap-6">
        {/* 左:输入 */}
        <section className="space-y-4">
          <details open={STATIC_HOST} className="bg-surface rounded-[20px] p-4">
            <summary className="cursor-pointer min-h-11 text-lg font-semibold">AI 接口设置</summary>
            <p className="text-sm text-secondary mt-1">{customAPI ? `已启用：${new URL(customAPI.baseUrl).host} · ${customAPI.model}` : STATIC_HOST ? "填写自己的接口和密钥，即可在本页使用真实 AI。" : "当前使用默认 Gemini 服务端；也可启用自己的接口。"}</p>
            <fieldset disabled={apiStatus.phase === "loading" || recognize.phase === "loading" || plan.phase === "loading"} className="space-y-3 mt-3 disabled:opacity-60">
              <label className="block text-sm text-secondary">接口类型
                <select aria-label="接口类型" value={apiDraft.provider} onChange={(e) => editAPI(e.target.value === "gemini" ? initialAPIConfig() : { provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "", apiKey: "" })} className="block mt-1 w-full min-h-11 bg-surface2 border border-borderctl rounded-lg px-3 text-cream">
                  <option value="gemini">Gemini 原生接口</option>
                  <option value="openai-compatible">OpenAI 兼容接口</option>
                </select>
              </label>
              <label className="block text-sm text-secondary">API 地址
                <input aria-label="API 地址" type="url" autoComplete="off" spellCheck={false} value={apiDraft.baseUrl} onChange={(e) => editAPI({ baseUrl: e.target.value })} className="block mt-1 w-full min-h-11 bg-transparent border border-borderctl rounded-lg px-3 text-cream" />
              </label>
              <label className="block text-sm text-secondary">模型名称
                <input aria-label="模型名称" autoComplete="off" spellCheck={false} value={apiDraft.model} onChange={(e) => editAPI({ model: e.target.value })} placeholder="填写服务商提供的模型名称" className="block mt-1 w-full min-h-11 bg-transparent border border-borderctl rounded-lg px-3 text-cream" />
              </label>
              <label className="block text-sm text-secondary">API Key
                <input aria-label="API Key" type="password" autoComplete="off" spellCheck={false} value={apiDraft.apiKey} onChange={(e) => editAPI({ apiKey: e.target.value })} placeholder="仅在当前页面使用，刷新后清除" className="block mt-1 w-full min-h-11 bg-transparent border border-borderctl rounded-lg px-3 text-cream" />
              </label>
              <p className="text-xs text-secondary">密钥仅存于当前页面内存。图片、输入和密钥将直接发送到你填写的接口，请使用你信任的 HTTPS 地址。接口需允许浏览器跨域访问（CORS）；图片识别需模型支持图片输入。</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={enableAPI} className="min-h-11 px-4 rounded-full bg-cream text-canvas font-semibold">启用自定义接口</button>
                <button onClick={testAPI} className="min-h-11 px-4 rounded-full border border-borderctl text-sm text-secondary">{apiStatus.phase === "loading" ? "测试中…" : "测试连接"}</button>
                <button onClick={() => { setAPIDraft(initialAPIConfig()); setCustomAPI(null); setAPIStatus({ phase: "idle", message: "已清除密钥并关闭自定义接口。" }); markEdited(); }} className="min-h-11 px-4 rounded-full border border-borderctl text-sm text-secondary">清除密钥并关闭</button>
              </div>
            </fieldset>
            {apiStatus.message && <p role="status" className={`text-sm mt-2 ${apiStatus.phase === "error" ? "text-danger" : apiStatus.phase === "success" ? "text-success" : "text-secondary"}`}>{apiStatus.message}</p>}
          </details>
          {/* 上传 */}
          <div className="bg-surface rounded-[20px] p-4">
            <p className="text-sm text-secondary mb-2">{customAPI ? `图片将发送到你配置的接口（${new URL(customAPI.baseUrl).host}）识别。` : STATIC_HOST ? "请先配置自己的 AI 接口，即可上传图片识别。" : "图片将发送给默认 Gemini 服务端识别。"}本地不保存照片，也可以直接手动输入。</p>
            <div className="flex items-start gap-3">
              {image ? (
                <div className="relative">
                  <img src={image.url} alt="已选图片预览" className="h-[140px] w-auto rounded-xl object-cover" />
                  {image.demo && <span className="absolute bottom-1 left-1 text-xs bg-canvas/80 text-accenttext px-2 py-0.5 rounded">AI 生成示例图</span>}
                  <button aria-label="移除图片" onClick={() => { setImage(null); imageBlob.current = null; markEdited(); }} className="absolute -top-2 -right-2 bg-canvas rounded-full p-1 border border-borderctl"><X size={14} /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className="h-[140px] w-full border border-dashed border-borderctl rounded-xl flex flex-col items-center justify-center gap-2 text-secondary hover:text-cream">
                  <ImagePlus size={24} /> <span className="text-sm">选择图片(JPEG/PNG/WebP,≤5MB)</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }} />
            </div>
            {image && !image.demo && (
              <button onClick={runRecognize} disabled={recognize.phase === "loading" || plan.phase === "loading" || apiStatus.phase === "loading"} className="mt-3 min-h-11 px-5 rounded-full bg-cream text-canvas font-semibold disabled:opacity-50 flex items-center gap-2">
                {recognize.phase === "loading" ? <><Loader2 size={16} className="animate-spin" /> 识别中…</> : "识别图片"}
              </button>
            )}
            {recognize.phase === "error" && (
              <div className="mt-3 text-danger text-sm flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{recognize.message} <button className="underline" onClick={runRecognize}>重试</button>，或手动输入下方清单，或<button className="underline" onClick={() => loadDemo(mode)}>加载演示样例</button>。</span>
              </div>
            )}
          </div>

          {/* 清单确认 */}
          <div className="bg-surface rounded-[20px] p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">确认清单</h2>
              <button onClick={() => { setRows((rs) => [...rs, { id: uid(), name: "", kind: mode === "meal" ? "ingredient" : "material", quantity: "", unit: mode === "meal" ? "g" : "piece", uncertain: false }]); markEdited(); }} className="min-h-11 px-3 rounded-full border border-borderctl text-sm flex items-center gap-1 text-secondary hover:text-cream">
                <Plus size={14} /> 手动添加
              </button>
            </div>
            {demoTag && !demoEdited && <p className="text-xs text-accenttext mb-2">固定演示样例清单；修改后将切换为真实模式重新生成。</p>}
            {rows.length === 0 && <p className="text-secondary text-sm">暂无条目。{mode === "meal" ? "识别图片后会自动估算食材用量，可直接确认生成，也可手动调整。" : "识别图片或手动添加旧物，再确认数量。"}</p>}
            {rows.some((r) => r.quantitySource) && <p className="text-secondary text-sm mb-2">已自动填入大致用量，无需逐项填写；可直接确认生成，也可按实际修改。标注“参考估算”的条目采用常见份量，实际用量与余量均可能有偏差。</p>}
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-2 flex-wrap bg-surface2 rounded-xl p-2">
                  <input aria-label="名称" value={r.name} onChange={(e) => updateRow(r.id, { name: e.target.value })} placeholder="名称" className="bg-transparent border border-borderctl rounded-lg px-2 py-1.5 min-h-11 flex-1 min-w-24" />
                  <select aria-label="类别" value={r.kind} onChange={(e) => updateRow(r.id, { kind: e.target.value as Kind })} className="bg-surface2 border border-borderctl rounded-lg px-2 py-1.5 min-h-11">
                    {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input aria-label="数量" type="number" min="0" step={r.unit === "piece" ? 1 : 1} value={r.quantity} onChange={(e) => updateRow(r.id, { quantity: e.target.value })} placeholder="数量" className="bg-transparent border border-borderctl rounded-lg px-2 py-1.5 min-h-11 w-24" />
                  <select aria-label="单位" value={r.unit} onChange={(e) => updateRow(r.id, { unit: e.target.value as Unit })} className="bg-surface2 border border-borderctl rounded-lg px-2 py-1.5 min-h-11">
                    {Object.entries(UNIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {r.uncertain && <span className="text-xs text-accenttext">待核对</span>}
                  {r.quantitySource && <span className="text-xs text-accenttext">{r.quantitySource === "image_estimate" ? "图片估算" : "参考估算"}</span>}
                  <button aria-label="删除" onClick={() => { setRows((rs) => rs.filter((x) => x.id !== r.id)); markEdited(); }} className="p-2 text-secondary hover:text-danger"><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>

            {/* 基础用品 */}
            <details className="mt-3">
              <summary className="text-sm text-secondary cursor-pointer min-h-11 flex items-center">可用工具与设备</summary>
              {mode === "meal" ? (
                <div className="mt-2 space-y-2 text-sm">
                  <div className="pt-1 border-t border-line space-y-2">
                    {Object.keys(tools).map((name) => (
                      <label key={name} className="flex items-center gap-2 min-h-11">
                        <input type="checkbox" checked={tools[name]} onChange={(e) => { setTools({ ...tools, [name]: e.target.checked }); markEdited(); }} className="w-5 h-5 accent-[#DC5000]" /> {name}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 min-h-11">炉头数量
                      <select value={burners} onChange={(e) => { setBurners(e.target.value); markEdited(); }} className="bg-surface2 border border-borderctl rounded-lg px-2 py-1.5">
                        <option value="1">1 个</option><option value="2">2 个</option>
                      </select>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-sm">
                  {["平稳桌面", "剪刀", "胶带"].map((name) => (
                    <label key={name} className="flex items-center gap-2 min-h-11">
                      <input type="checkbox" checked={Boolean(reuseTools[name])} onChange={(e) => { setReuseTools({ ...reuseTools, [name]: e.target.checked }); markEdited(); }} className="w-5 h-5 accent-[#DC5000]" /> {name}
                    </label>
                  ))}
                </div>
              )}
            </details>
          </div>

          {mode === "meal" && (
            <details className="bg-surface rounded-[20px] p-4">
              <summary className="cursor-pointer min-h-11 text-lg font-semibold">常备食材仓库 · 已选 {pantry.filter((p) => p.included).length} 项</summary>
              <p role="status" className={`text-xs mt-1 ${pantryState.failed ? "text-danger" : "text-secondary"}`}>{pantryState.message}</p>
              {demoTag === "meal" && !demoEdited && <p className="text-xs text-accenttext mt-2">当前展示固定样例；你的常备仓库已保留，重新生成时会使用仓库。</p>}
              <fieldset disabled={!pantryState.ready} className="mt-3 space-y-2 text-sm disabled:opacity-50">
                  <p className="text-secondary text-xs">勾选家中已有的食材，每次生成自动使用。名称、参考用量和单位都可修改；生成方案不会自动扣减仓库。</p>
                  <ul className="space-y-1">
                    {pantry.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 flex-wrap">
                        <input type="checkbox" aria-label={`常备 ${p.name}`} checked={p.included} onChange={(e) => { setPantry(pantry.map((x) => x.id === p.id ? { ...x, included: e.target.checked } : x)); markEdited(); }} className="w-5 h-5 accent-[#DC5000]" />
                        <input aria-label="常备名称" placeholder="如：蚝油" value={p.name} onChange={(e) => { setPantry(pantry.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x)); markEdited(); }} className="bg-transparent border border-borderctl rounded-lg px-2 py-1 min-h-11 flex-1 min-w-16" />
                        <input aria-label="常备数量" type="number" min="0" value={p.quantity} onChange={(e) => { setPantry(pantry.map((x) => x.id === p.id ? { ...x, quantity: e.target.value } : x)); markEdited(); }} className="bg-transparent border border-borderctl rounded-lg px-2 py-1 min-h-11 w-20" />
                        <select aria-label="常备单位" value={p.unit} onChange={(e) => { setPantry(pantry.map((x) => x.id === p.id ? { ...x, unit: e.target.value as Unit } : x)); markEdited(); }} className="bg-surface2 border border-borderctl rounded-lg px-1 py-1 min-h-11">
                          {Object.entries(UNIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <button aria-label="删除常备" onClick={() => { setPantry(pantry.filter((x) => x.id !== p.id)); markEdited(); }} className="p-2 text-secondary hover:text-danger"><Trash2 size={14} /></button>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => { setPantry([...pantry, { id: uid(), name: "", kind: "consumable", quantity: "10", unit: "g", uncertain: false, included: false }]); markEdited(); }} className="min-h-11 px-3 rounded-full border border-borderctl text-xs flex items-center gap-1 text-secondary hover:text-cream">
                    <Plus size={12} /> 添加常备食材
                  </button>
              </fieldset>
            </details>
          )}

          {/* 约束 */}
          <div className="bg-surface rounded-[20px] p-4 space-y-3">
            <h2 className="text-lg font-semibold">限制条件</h2>
            <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
              {mode === "meal" && (
                <label className="text-sm text-secondary">人数
                  <input type="number" min={1} value={people} onChange={(e) => { setPeople(e.target.value); markEdited(); }} className="mt-1 w-full bg-transparent border border-borderctl rounded-lg px-2 py-1.5 min-h-11 text-cream" />
                </label>
              )}
              <label className="text-sm text-secondary">目标时间(分钟,是约束不是保证)
                <input type="number" min={1} value={maxMinutes} onChange={(e) => { setMaxMinutes(e.target.value); markEdited(); }} className="mt-1 w-full bg-transparent border border-borderctl rounded-lg px-2 py-1.5 min-h-11 text-cream" />
              </label>
            </div>
            {mode === "meal" && (
              <label className="block text-sm text-secondary">需避开的食材(逗号分隔;过敏请核对实际食品标签)
                <input value={avoidances} onChange={(e) => { setAvoidances(e.target.value); markEdited(); }} className="mt-1 w-full bg-transparent border border-borderctl rounded-lg px-2 py-1.5 min-h-11 text-cream" placeholder="如:花生、虾" />
              </label>
            )}
            <label className="block text-sm text-secondary">{mode === "meal" ? "口味偏好(可选)" : "用途偏好(可选)"}
              <input value={preferences} onChange={(e) => { setPreferences(e.target.value); markEdited(); }} className="mt-1 w-full bg-transparent border border-borderctl rounded-lg px-2 py-1.5 min-h-11 text-cream" />
            </label>
            <label className="flex items-center gap-2 min-h-11 text-sm">
              <input type="checkbox" checked={onlyExisting} onChange={(e) => { setOnlyExisting(e.target.checked); markEdited(); }} className="w-5 h-5 accent-[#DC5000]" />
              只用已有资源(关闭后最多补充 8 类常备消耗品,补齐前方案不可执行)
            </label>
            <button onClick={() => runPlan()} disabled={plan.phase === "loading" || recognize.phase === "loading" || apiStatus.phase === "loading"} className="w-full min-h-11 rounded-full bg-cream text-canvas font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {plan.phase === "loading" ? <><Loader2 size={16} className="animate-spin" /> 生成中…</> : mode === "meal" ? "确认并生成今晚菜单" : "确认并生成改造方案"}
            </button>
            {plan.phase === "error" && (
              <div className="text-danger text-sm flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{plan.message} {plan.retryable !== false && <button className="underline" onClick={() => runPlan()}>重试</button>} 或<button className="underline" onClick={() => loadDemo(mode)}>加载演示样例</button></span>
              </div>
            )}
            {questions.length > 0 && (
              <ul className="text-accenttext text-sm list-disc pl-5">
                {questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            )}
            {demoTag === "reuse" && (
              <button onClick={() => loadDemo("glue")} className="text-xs text-secondary underline">加载胶水验收夹具(演示缺料重规划)</button>
            )}
          </div>
        </section>

        {/* 右:结果 */}
        <section>
          {!result && (
            <div className="bg-surface rounded-[20px] p-8 text-secondary text-sm">
              <p className="text-lg text-cream mb-2 serif">这里会显示你的方案</p>
              <p>1. 上传图片识别,或直接手动添加{mode === "meal" ? "食材" : "旧物"}。</p>
              <p>2. 确认名称与数量、基础用品和限制。</p>
              <p>3. 点击生成,得到{mode === "meal" ? "一餐菜单、用量与制作顺序" : "两种互斥改造方案,选其一"}。</p>
              <p className="mt-2">也可以从右上角加载固定演示样例快速查看完整效果。</p>
            </div>
          )}

          {result && (
            <div className="relative space-y-4">
              {stale && (
                <div className="absolute inset-0 z-10 bg-canvas/85 rounded-[20px] flex flex-col items-center justify-center gap-3 text-center p-6">
                  <AlertTriangle size={28} className="text-accenttext" />
                  <p>输入已更改,旧结果与资源账本已失效,请重新生成。</p>
                  <button onClick={() => runPlan()} className="min-h-11 px-6 rounded-full bg-cream text-canvas font-semibold flex items-center gap-2"><RefreshCw size={16} /> 重新规划</button>
                </div>
              )}

              {/* 结果头部 */}
              <div className="bg-surface rounded-[20px] p-4 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-semibold">{mealData ? "今晚菜单" : "改造方案"}</h2>
                    <span className={`text-xs px-2 py-1 rounded-full border ${resultSource === "demo" ? "border-accenttext text-accenttext" : "border-success text-success"}`}>
                      {sourceLabel(resultSource ?? "demo")}
                    </span>
                    {excludedExtras.length > 0 && <span className="text-xs text-secondary">已排除:{excludedExtras.join("、")}</span>}
                  </div>
                  <p className="text-secondary text-sm mt-1">
                    {mealData && `${mealData.menu.dishes[0]?.servings ?? people} 人 · 预计 ${mealData.estimatedMinutes} 分钟(估时非保证)`}
                    {reuseData && `互斥方案 ${reuseData.plans.length} 个,选其一`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={copyPlan} className="min-h-11 px-4 rounded-full border border-borderctl text-sm flex items-center gap-1 text-secondary hover:text-cream">
                    {copied ? <><Check size={14} className="text-success" /> 已复制</> : <><Copy size={14} /> 复制方案</>}
                  </button>
                  <button onClick={() => runPlan()} className="min-h-11 px-4 rounded-full border border-borderctl text-sm flex items-center gap-1 text-secondary hover:text-cream">
                    <RefreshCw size={14} /> 重新规划
                  </button>
                </div>
              </div>

              {result.envelope.warnings.map((w, i) => (
                <p key={i} className="text-accenttext text-sm flex items-start gap-2"><AlertTriangle size={14} className="mt-1 shrink-0" />{w}</p>
              ))}

              {/* 食材菜单 */}
              {mealData && (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    {mealData.menu.dishes.map((d) => (
                      <details key={d.id} className="bg-surface rounded-[20px] p-4 group" open={false}>
                        <summary className="cursor-pointer list-none">
                          <span className="text-xs text-accenttext">{d.role === "staple" ? "主食" : "菜"} · {d.servings} 人份</span>
                          <h3 className="text-lg font-semibold">{d.name}</h3>
                          <p className="text-sm text-secondary mt-1">{d.uses.map((u) => `${inventoryNow.find((r) => r.id === u.resourceId)?.name ?? u.resourceId} ${u.quantity}${UNIT_LABEL[u.unit]}`).join("、")}</p>
                          <span className="text-xs text-secondary underline">展开步骤</span>
                        </summary>
                        <ol className="mt-3 space-y-2">
                          {d.steps.map((s, i) => {
                            const key = `${d.id}:${s.id}`;
                            return (
                              <li key={s.id} className="flex items-start gap-2 text-sm">
                                <button aria-label={`步骤 ${i + 1} 完成`} onClick={() => setCheckedSteps((prev) => { const n = new Set(prev); if (n.has(key)) { n.delete(key); } else { n.add(key); } return n; })} className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${checkedSteps.has(key) ? "bg-success border-success text-canvas" : "border-borderctl"}`}>
                                  {checkedSteps.has(key) && <Check size={12} />}
                                </button>
                                <span className={checkedSteps.has(key) ? "line-through text-secondary" : ""}>{i + 1}. {s.text}{s.minutes > 0 && <span className="text-secondary">(约{s.minutes}分钟)</span>}</span>
                              </li>
                            );
                          })}
                        </ol>
                      </details>
                    ))}
                  </div>

                  {/* 时间线 */}
                  <div className="bg-surface rounded-[20px] p-4">
                    <h3 className="font-semibold mb-2">制作顺序</h3>
                    <ol className="space-y-1 text-sm">
                      {mealData.timeline.map((t, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="text-accenttext shrink-0 w-20">{Math.round(t.startMinute)}–{Math.round(t.endMinute)}分</span>
                          <span>{t.action}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              )}

              {/* 旧物方案 */}
              {reuseData && (
                <div className="grid gap-3 md:grid-cols-2">
                  {reuseData.plans.map((p) => {
                    const selected = p.id === selectedPlanId;
                    return (
                      <div key={p.id} className={`bg-surface rounded-[20px] p-4 border ${selected ? "border-success" : "border-line"}`}>
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">{p.title}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full ${selected ? "bg-success text-canvas" : "border border-borderctl text-secondary"}`}>{selected ? "已选" : "备选"}</span>
                        </div>
                        <p className="text-secondary text-sm mt-1">约 {p.estimatedMinutes} 分钟 · {p.uses.map((u) => `${inventoryNow.find((r) => r.id === u.resourceId)?.name ?? u.resourceId}×${u.quantity}`).join("、")}</p>
                        {!selected && (
                          <button onClick={() => { setSelectedPlanId(p.id); setCheckedSteps(new Set()); }} className="mt-3 min-h-11 px-4 rounded-full bg-cream text-canvas text-sm font-semibold">选这个</button>
                        )}
                        {selected && (
                          <>
                            <ol className="mt-3 space-y-2">
                              {p.steps.map((s, i) => {
                                const key = `${p.id}:${s.id}`;
                                return (
                                  <li key={s.id} className="flex items-start gap-2 text-sm">
                                    <button aria-label={`步骤 ${i + 1} 完成`} onClick={() => setCheckedSteps((prev) => { const n = new Set(prev); if (n.has(key)) { n.delete(key); } else { n.add(key); } return n; })} className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${checkedSteps.has(key) ? "bg-success border-success text-canvas" : "border-borderctl"}`}>
                                      {checkedSteps.has(key) && <Check size={12} />}
                                    </button>
                                    <span className={checkedSteps.has(key) ? "line-through text-secondary" : ""}>{i + 1}. {s.text}{s.minutes > 0 && <span className="text-secondary">(约{s.minutes}分钟)</span>}</span>
                                  </li>
                                );
                              })}
                            </ol>
                            <ul className="mt-3 text-sm text-secondary list-disc pl-5">
                              {p.checks.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 补购与替代 */}
              {extrasAll.length > 0 && (
                <div className="bg-surface rounded-[20px] p-4">
                  <h3 className="font-semibold mb-2">需要补充(补齐前方案不可执行)</h3>
                  <ul className="space-y-2">
                    {extrasAll.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-sm flex-wrap">
                        <span>{e.name} {e.quantity}{UNIT_LABEL[e.unit]} <span className="text-danger">· 尚未拥有</span></span>
                        <button onClick={() => excludeExtra(e.name)} className="min-h-11 px-4 rounded-full border border-accenttext text-accenttext text-sm">这项没有,换个办法</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(mealData?.substitutions.length || reuseData?.substitutions.length) ? (
                <div className="bg-surface rounded-[20px] p-4">
                  <h3 className="font-semibold mb-2">巧用替代</h3>
                  <ul className="space-y-2 text-sm">
                    {(mealData?.substitutions ?? reuseData?.substitutions ?? []).map((s, i) => (
                      <li key={i}>
                        <span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${s.state === "applied" ? "bg-success/20 text-success" : "bg-accent/20 text-accenttext"}`}>{s.state === "applied" ? "已采用" : "建议"}</span>
                        缺「{s.missingName}」:{s.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* 资源账本 */}
              {ledger.length > 0 && (
                <div className="bg-surface rounded-[20px] p-4">
                  <h3 className="font-semibold mb-2">用量汇总(由已确认清单核算)</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="text-secondary text-left"><th className="py-1">资源</th><th>已有</th><th>本次用</th><th>剩余</th></tr></thead>
                    <tbody>
                      {ledger.map(({ resource, used, remaining }) => (
                        <tr key={resource.id} className="border-t border-line">
                          <td className="py-1.5">{resource.name}</td>
                          <td>{resource.quantityEstimated ? "约 " : ""}{resource.quantity}{UNIT_LABEL[resource.unit]}</td>
                          <td>{used}{UNIT_LABEL[resource.unit]}</td>
                          <td className={remaining >= 0 ? "text-success" : "text-danger"}>{resource.quantityEstimated ? "约 " : ""}{remaining}{UNIT_LABEL[resource.unit]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {mealData && mealData.assumptions.length > 0 && (
                <div className="bg-surface rounded-[20px] p-4 text-sm text-secondary">
                  <h3 className="font-semibold text-cream mb-1">条件与说明</h3>
                  <ul className="list-disc pl-5 space-y-1">{mealData.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="px-6 py-6 border-t border-line text-secondary text-xs">
        固定样例为人工编排内容,配图为 AI 生成示例,非真实拍摄;真实请求失败不会自动切换为样例成功。
      </footer>
    </div>
  );
}
