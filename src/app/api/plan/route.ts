import { NextResponse } from "next/server";
import { callGemini, geminiConfigured } from "@/lib/gemini";
import { PLAN_SYSTEM } from "@/lib/prompts";
import { MEAL_PLAN_SCHEMA, REUSE_PLAN_SCHEMA } from "@/lib/jsonSchemas";
import { envelope, Mode } from "@/lib/types";
import { PlanInput, planEnvelope } from "@/lib/model-results";

export const runtime = "nodejs";


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
  const parsedReq = PlanInput.safeParse(body);
  if (!parsedReq.success) {
    const mode = Mode.safeParse((body as { mode?: unknown })?.mode);
    return invalid(mode.success ? mode.data : "meal", "输入未通过校验：请确认库存数量、单位与确认状态。", 400, "bad_input", false);
  }
  const { mode, inventory, constraints, excludedExtras } = parsedReq.data;

  if (!geminiConfigured()) {
    return invalid(mode, "尚未配置 GEMINI_API_KEY。请在 .env.local 配置后重启；也可使用固定演示样例。", 503, "not_configured", false);
  }

  const userPayload = { mode, inventory, inventoryConfirmed: true as const, constraints, excludedExtras };
  const result = await callGemini({
    systemInstruction: PLAN_SYSTEM,
    input: [{ type: "text", text: JSON.stringify(userPayload) }],
    schema: mode === "meal" ? MEAL_PLAN_SCHEMA : REUSE_PLAN_SCHEMA,
  });
  if (!result.ok) {
    return invalid(mode, result.error.message, result.httpStatus, result.error.code, result.error.retryable);
  }

  try {
    return NextResponse.json(planEnvelope(result.outputText, userPayload));
  } catch (error) {
    return invalid(mode, error instanceof Error ? error.message : "生成结果未通过校验，请重试。", 502);
  }
}
