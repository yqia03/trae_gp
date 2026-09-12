import { NextResponse } from "next/server";
import { z } from "zod";
import { callGemini, geminiConfigured } from "@/lib/gemini";
import { RECOGNIZE_SYSTEM } from "@/lib/prompts";
import { RECOGNIZE_SCHEMA } from "@/lib/jsonSchemas";
import { Candidate, envelope, Mode, ModelPayload } from "@/lib/types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function isJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
function isWebp(buf: Buffer): boolean {
  return buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
}

export async function POST(req: Request) {
  const modeRaw = new URL(req.url).searchParams.get("mode");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(envelope("meal", { error: { code: "bad_input", message: "请求格式不正确。", retryable: false } }), { status: 400 });
  }
  const modeParsed = Mode.safeParse(form.get("mode") ?? modeRaw);
  const mode: Mode = modeParsed.success ? modeParsed.data : "meal";
  if (!modeParsed.success) {
    return NextResponse.json(envelope("meal", { error: { code: "bad_input", message: "mode 必须为 meal 或 reuse。", retryable: false } }), { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(envelope(mode, { error: { code: "bad_input", message: "缺少图片文件。", retryable: false } }), { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(envelope(mode, { error: { code: "too_large", message: "图片超过 5MB，请压缩后重试。", retryable: false } }), { status: 413 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  let mime: string | null = null;
  if (isJpeg(buf)) mime = "image/jpeg";
  else if (isPng(buf)) mime = "image/png";
  else if (isWebp(buf)) mime = "image/webp";
  if (!mime) {
    return NextResponse.json(envelope(mode, { error: { code: "bad_type", message: "仅支持 JPEG / PNG / WebP 图片。", retryable: false } }), { status: 415 });
  }
  if (!geminiConfigured()) {
    return NextResponse.json(
      envelope(mode, {
        error: { code: "not_configured", message: "尚未配置 GEMINI_API_KEY。请在项目根目录 .env.local 中配置 GEMINI_API_KEY 与 GEMINI_MODEL 后重启服务；也可以先使用手动输入或演示样例。", retryable: false },
      }),
      { status: 503 },
    );
  }

  const result = await callGemini({
    systemInstruction: RECOGNIZE_SYSTEM,
    input: [
      { type: "text", text: `mode=${mode}。请识别图片中的${mode === "meal" ? "食材" : "闲置物品与相关材料"}候选。` },
      { type: "image", data: buf.toString("base64"), mime_type: mime },
    ],
    schema: RECOGNIZE_SCHEMA,
  });
  if (!result.ok) {
    return NextResponse.json(envelope(mode, { error: result.error }), { status: result.httpStatus });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.outputText);
  } catch {
    return NextResponse.json(envelope(mode, { error: { code: "invalid_output", message: "模型返回格式无效，请重试。", retryable: true } }), { status: 502 });
  }
  const payload = ModelPayload.safeParse(parsed);
  if (!payload.success) {
    return NextResponse.json(envelope(mode, { error: { code: "invalid_output", message: "模型返回结构无效，请重试。", retryable: true } }), { status: 502 });
  }

  let candidates: Candidate[] = [];
  if (payload.data.data && typeof payload.data.data === "object") {
    const c = z.object({ candidates: z.array(Candidate) }).safeParse(payload.data.data);
    if (!c.success) {
      return NextResponse.json(envelope(mode, { error: { code: "invalid_output", message: "识别结果未通过校验，请重试。", retryable: true } }), { status: 502 });
    }
    candidates = c.data.candidates;
  }
  const seen = new Set<string>();
  candidates = candidates.filter((cand) => {
    if (seen.has(cand.id)) return false;
    seen.add(cand.id);
    return true;
  });

  return NextResponse.json(
    envelope(mode, {
      status: payload.data.status,
      warnings: payload.data.warnings,
      questions: payload.data.questions,
      data: { candidates } as never,
    }),
  );
}
