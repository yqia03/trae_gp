export type CustomAIProvider = "gemini" | "openai-compatible";

export interface CustomAIConfig {
  provider: CustomAIProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface CustomAIParams {
  systemInstruction: string;
  prompt: string;
  schema: Record<string, unknown>;
  image?: { mimeType: string; data: string };
}

const TIMEOUT_MS = 60_000;
const NETWORK_ERROR = "无法连接自定义接口，请检查网络及接口的跨域（CORS）设置；接口必须允许本站来源。";
const TIMEOUT_ERROR = "AI 请求超过 60 秒，请稍后重试或选择更快的模型。";

export function validateCustomAIConfig(config: CustomAIConfig): CustomAIConfig {
  if (config.provider !== "gemini" && config.provider !== "openai-compatible") {
    throw new Error("请选择支持的 API 接口类型。");
  }
  const baseUrl = config.baseUrl?.trim();
  const model = config.model?.trim();
  const apiKey = config.apiKey?.trim();
  if (!baseUrl) throw new Error("请填写 API 地址。");
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error("API 地址格式无效，请填写完整 HTTPS 地址。"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || /[?#]/.test(baseUrl)) {
    throw new Error("API 地址必须使用 HTTPS，且不能包含账号、密码、查询参数或片段。");
  }
  if (!model || /[\s?#\\]/.test(model)) throw new Error("请填写有效的模型名称。");
  if (config.provider === "gemini" && !/^(?:models\/)?[A-Za-z0-9._-]+$/.test(model)) {
    throw new Error("Gemini 模型名称格式无效。");
  }
  if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error("请填写有效的 API Key。");
  const normalized = { provider: config.provider, baseUrl: url.href.replace(/\/+$/, ""), model, apiKey };
  endpoint(normalized);
  return normalized;
}

function endpoint(config: CustomAIConfig): string {
  const url = new URL(config.baseUrl);
  const path = url.pathname.replace(/\/+$/, "");
  if (config.provider === "openai-compatible") {
    if (path.endsWith("/chat/completions")) return url.href;
    if (path && !path.endsWith("/v1")) {
      throw new Error("OpenAI 兼容地址请填写域名、以 /v1 结尾的地址或完整 /chat/completions 地址。");
    }
    url.pathname = `${path || "/v1"}/chat/completions`;
  } else {
    // An explicit model endpoint is honored; the model field must agree with it.
    const full = path.match(/\/models\/([^/]+):generateContent$/);
    const model = config.model.replace(/^models\//, "");
    if (full) {
      if (full[1] !== model) throw new Error("完整 Gemini 接口地址中的模型与模型名称不一致，请修改后重试。");
      return url.href;
    }
    if (path && !/\/v1(?:beta)?$/.test(path)) {
      throw new Error("Gemini 地址请填写域名、以 /v1beta 结尾的地址或完整 generateContent 地址。");
    }
    url.pathname = `${path || "/v1beta"}/models/${model}:generateContent`;
  }
  return url.href;
}

function httpError(status: number): string {
  if (status === 401 || status === 403) return "API Key 无效或没有权限，请检查密钥及模型访问权限。";
  if (status === 429) return "自定义接口请求过多或额度不足，请检查余额或稍后重试。";
  if (status === 408 || status === 504) return TIMEOUT_ERROR;
  if (status === 400 || status === 422) return "接口不接受此请求，请确认模型支持图片（识别时）及 JSON 输出格式。";
  if (status === 404) return "找不到接口或模型，请检查 API 地址、接口类型和模型名称。";
  return "自定义 AI 服务暂时不可用，请稍后重试。";
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

// Our shared schemas use OpenAPI nullable; generateContent responseJsonSchema
// and JSON Schema prompts require an explicit null alternative (including enums).
function toJSONSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "nullable"));
  for (const key of ["properties", "$defs", "definitions", "patternProperties", "dependentSchemas"]) {
    const entries = object(result[key]);
    if (entries) result[key] = Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, object(value) ? toJSONSchema(object(value)!) : value]));
  }
  for (const key of ["items", "additionalProperties", "contains", "propertyNames", "not", "if", "then", "else"]) {
    const value = object(result[key]);
    if (value) result[key] = toJSONSchema(value);
  }
  for (const key of ["anyOf", "allOf", "oneOf", "prefixItems"]) {
    const values = result[key];
    if (Array.isArray(values)) result[key] = values.map((value) => object(value) ? toJSONSchema(object(value)!) : value);
  }
  return schema.nullable === true ? { anyOf: [result, { type: "null" }] } : result;
}

function outputText(payload: unknown, provider: CustomAIProvider): string {
  const root = object(payload);
  let value: unknown;
  if (provider === "gemini") {
    const candidate = object(Array.isArray(root?.candidates) ? root.candidates[0] : undefined);
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      throw new Error("模型未能完成输出，请调整输入或模型后重试。");
    }
    const parts = object(candidate?.content)?.parts;
    value = Array.isArray(parts) ? parts.flatMap((part) => {
      const item = object(part);
      return item?.thought !== true && typeof item?.text === "string" ? [item.text] : [];
    }).join("") : undefined;
  } else {
    const choice = object(Array.isArray(root?.choices) ? root.choices[0] : undefined);
    if (choice?.finish_reason && choice.finish_reason !== "stop") {
      throw new Error("模型未能完成输出，请调整输入或模型后重试。");
    }
    const content = object(choice?.message)?.content;
    value = Array.isArray(content) ? content.flatMap((part) => {
      const item = object(part);
      return item?.type === "text" && typeof item.text === "string" ? [item.text] : [];
    }).join("") : content;
  }
  if (typeof value !== "string" || !value.trim()) throw new Error("模型未返回有效内容，请重试或更换模型。");
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  const text = (fenced ? fenced[1] : trimmed).trim();
  try { JSON.parse(text); } catch { throw new Error("模型返回的内容不是有效 JSON，请重试或更换支持 JSON 输出的模型。"); }
  return text;
}

/** Credentials and image data stay in this call's memory; nothing is persisted or logged. */
export async function callCustomAI(
  input: CustomAIConfig,
  params: CustomAIParams,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<string> {
  const config = validateCustomAIConfig(input);
  const schema = toJSONSchema(params.schema);
  const system = `${params.systemInstruction}\n\n仅输出符合以下 JSON Schema 的 JSON 对象，不要解释或 Markdown：\n${JSON.stringify(schema)}`;
  const body = config.provider === "gemini" ? {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [
      { text: params.prompt },
      ...(params.image ? [{ inlineData: params.image }] : []),
    ] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
  } : {
    model: config.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: params.image ? [
        { type: "text", text: params.prompt },
        { type: "image_url", image_url: { url: `data:${params.image.mimeType};base64,${params.image.data}` } },
      ] : params.prompt },
    ],
    response_format: { type: "json_object" },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetcher(endpoint(config), {
        method: "POST",
        headers: config.provider === "gemini"
          ? { "Content-Type": "application/json", "x-goog-api-key": config.apiKey }
          : { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
      });
    } catch {
      throw new Error(controller.signal.aborted ? TIMEOUT_ERROR : NETWORK_ERROR);
    }
    if (!response.ok) throw new Error(httpError(response.status));
    let payload: unknown;
    try { payload = await response.json(); } catch {
      throw new Error(controller.signal.aborted ? TIMEOUT_ERROR : "接口未返回有效 JSON，请检查接口地址及类型。");
    }
    return outputText(payload, config.provider);
  } finally {
    clearTimeout(timer);
  }
}
