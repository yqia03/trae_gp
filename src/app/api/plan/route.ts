import { NextResponse } from "next/server";
import { z } from "zod";
import { callGemini, geminiConfigured } from "@/lib/gemini";
import { PLAN_SYSTEM } from "@/lib/prompts";
import { MEAL_PLAN_SCHEMA, REUSE_PLAN_SCHEMA } from "@/lib/jsonSchemas";
import { Constraints, envelope, MealData, Mode, ModelPayload, Resource, ReuseData } from "@/lib/types";
import { validateMealData, validateReuseData } from "@/lib/validate";

export const runtime = "nodejs";

const PlanRequest = z.object({
  mode: Mode,
  inventory: z.array(Resource).min(1),
  inventoryConfirmed: z.literal(true),
  constraints: Constraints,
  excludedExtras: z.array(z.string()).default([]),
});

function invalid(mode: Mode, message: string, status: number, code = "invalid_output", retryable = true) {
  return NextResponse.json(envelope(mode, { error: { code, message, retryable } }), { status });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalid("meal", "请求格式不正确。", 400, "bad_input", false);
  }
  const parsedReq = PlanRequest.safeParse(body);
  if (!parsedReq.success) {
    const mode = Mode.safeParse((body as { mode?: unknown })?.mode);
    return invalid(mode.success ? mode.data : "meal", "输入未通过校验：请确认库存数量、单位与确认状态。", 400, "bad_input", false);
  }
  const { mode, inventory, constraints, excludedExtras } = parsedReq.data;

  if (!geminiConfigured()) {
    return invalid(mode, "尚未配置 GEMINI_API_KEY。请在 .env.local 配置后重启；也可使用固定演示样例。", 503, "not_configured", false);
  }

  const userPayload = { mode, inventory, inventoryConfirmed: true, constraints, excludedExtras };
  const result = await callGemini({
    systemInstruction: PLAN_SYSTEM,
    input: [{ type: "text", text: JSON.stringify(userPayload) }],
    schema: mode === "meal" ? MEAL_PLAN_SCHEMA : REUSE_PLAN_SCHEMA,
  });
  if (!result.ok) {
    return invalid(mode, result.error.message, result.httpStatus, result.error.code, result.error.retryable);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.outputText);
  } catch {
    return invalid(mode, "模型返回格式无效，请重试。", 502);
  }
  const payload = ModelPayload.safeParse(parsed);
  if (!payload.success) {
    return invalid(mode, "模型返回结构无效，请重试。", 502);
  }
  const p = payload.data;

  if (p.status !== "ready") {
    return NextResponse.json(
      envelope(mode, { status: p.status, warnings: p.warnings, questions: p.questions, data: null }),
    );
  }

  if (mode === "meal") {
    const d = MealData.safeParse(p.data);
    if (!d.success) return invalid(mode, "菜单结构未通过校验，请重新生成。", 502);
    const violations = validateMealData(d.data, inventory, constraints, excludedExtras);
    if (violations.length > 0) {
      return invalid(mode, `生成结果未通过资源校验：${violations[0]}${violations.length > 1 ? ` 等 ${violations.length} 项` : ""}。请重新生成或调整输入。`, 502);
    }
    return NextResponse.json(envelope<MealData>(mode, { status: "ready", data: d.data, warnings: p.warnings, questions: p.questions }));
  }

  const d = ReuseData.safeParse(p.data);
  if (!d.success) return invalid(mode, "方案结构未通过校验，请重新生成。", 502);
  const violations = validateReuseData(d.data, inventory, constraints, excludedExtras);
  if (violations.length > 0) {
    return invalid(mode, `生成结果未通过资源校验：${violations[0]}${violations.length > 1 ? ` 等 ${violations.length} 项` : ""}。请重新生成或调整输入。`, 502);
  }
  return NextResponse.json(envelope<ReuseData>(mode, { status: "ready", data: d.data, warnings: p.warnings, questions: p.questions }));
}
