import { GoogleGenAI } from "@google/genai";
import type { ApiError } from "./types";

const REQUEST_TIMEOUT_MS = 30_000;
const TOTAL_BUDGET_MS = 45_000;

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function client(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
  });
}

export interface GeminiCallParams {
  systemInstruction: string;
  input: unknown[];
  schema: Record<string, unknown>;
}

export type GeminiCallResult =
  | { ok: true; outputText: string }
  | { ok: false; httpStatus: number; error: ApiError };

function classifyError(err: unknown): { httpStatus: number; error: ApiError } {
  const e = err as { status?: number; message?: string; name?: string };
  const status = typeof e?.status === "number" ? e.status : 0;
  if (e?.name === "AbortError" || e?.name === "TimeoutError" || status === 408 || status === 504) {
    return { httpStatus: 504, error: { code: "timeout", message: "请求超时，请稍后重试。", retryable: true } };
  }
  if (status === 429) {
    return { httpStatus: 429, error: { code: "rate_limited", message: "请求过多或额度受限，请稍后再试。", retryable: true } };
  }
  if (status === 401 || status === 403) {
    return { httpStatus: 503, error: { code: "not_configured", message: "Gemini 密钥无效或未授权，请检查本地配置。", retryable: false } };
  }
  if (status === 400) {
    return { httpStatus: 502, error: { code: "bad_request", message: "请求未被服务接受，请重试或调整输入。", retryable: true } };
  }
  if (status >= 500 || status === 0) {
    return { httpStatus: 503, error: { code: "unavailable", message: "服务暂时不可用或网络异常，请稍后重试。", retryable: true } };
  }
  return { httpStatus: 503, error: { code: "unknown", message: "请求失败，请稍后重试。", retryable: true } };
}

export async function callGemini(params: GeminiCallParams): Promise<GeminiCallResult> {
  const started = Date.now();
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const ai = client();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const interaction = await ai.interactions.create({
        model,
        input: params.input as never,
        system_instruction: params.systemInstruction,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: params.schema,
        },
        store: false,
      } as never);
      const text = (interaction as { output_text?: string }).output_text;
      if (!text || typeof text !== "string") {
        return { ok: false, httpStatus: 502, error: { code: "empty_output", message: "模型未返回有效内容，请重试。", retryable: true } };
      }
      return { ok: true, outputText: text };
    } catch (err) {
      const classified = classifyError(err);
      const elapsed = Date.now() - started;
      const transient = classified.httpStatus === 429 || classified.httpStatus === 503;
      const budgetLeft = TOTAL_BUDGET_MS - elapsed;
      if (attempt === 0 && transient && budgetLeft > REQUEST_TIMEOUT_MS + 1500) {
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 500));
        continue;
      }
      return { ok: false, ...classified };
    }
  }
  return { ok: false, httpStatus: 503, error: { code: "unavailable", message: "请求失败，请稍后重试。", retryable: true } };
}
