import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { callCustomAI, validateCustomAIConfig } from "./custom-ai.ts";
import type { CustomAIConfig } from "./custom-ai.ts";
import { RECOGNIZE_SCHEMA, MEAL_PLAN_SCHEMA, REUSE_PLAN_SCHEMA } from "./jsonSchemas.ts";

const config: CustomAIConfig = { provider: "gemini", baseUrl: "https://example.com", model: "gemini-test", apiKey: "user-supplied-test-key" };
const params = { systemInstruction: "你是资源规划助手", prompt: "识别食材", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } };
const geminiResponse = () => Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }] });

test("Gemini 请求包含原生图片与 JSON schema，密钥只在请求头，不随重定向传递", async () => {
  let calls = 0;
  const result = await callCustomAI(config, { ...params, image: { mimeType: "image/jpeg", data: "dGVzdA==" } }, async (url, init) => {
    calls++;
    assert.equal(url, "https://example.com/v1beta/models/gemini-test:generateContent");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.referrerPolicy, "no-referrer");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-goog-api-key"), config.apiKey);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.contents[0].parts[1].inlineData, { mimeType: "image/jpeg", data: "dGVzdA==" });
    assert.deepEqual(body.generationConfig.responseJsonSchema, params.schema);
    assert.ok(!String(init?.body).includes(config.apiKey));
    return geminiResponse();
  });
  assert.equal(result, '{"ok":true}');
  assert.equal(calls, 1);
});

test("OpenAI 兼容接口发送完整 schema、Bearer 和图片，解析代码围栏", async () => {
  const result = await callCustomAI({ ...config, provider: "openai-compatible", baseUrl: "https://example.com/v1", model: "vision-model" }, { ...params, image: { mimeType: "image/png", data: "dGVzdA==" } }, async (url, init) => {
    assert.equal(url, "https://example.com/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${config.apiKey}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "vision-model");
    assert.ok(body.messages[0].content.includes(JSON.stringify(params.schema)));
    assert.equal(body.messages[1].content[1].image_url.url, "data:image/png;base64,dGVzdA==");
    assert.deepEqual(body.response_format, { type: "json_object" });
    return Response.json({ choices: [{ message: { content: '```json\n{"ok":true}\n```' }, finish_reason: "stop" }] });
  });
  assert.equal(result, '{"ok":true}');
});

test("真实项目 Schema 转为有效 null 分支，保留嵌套数字和枚举约束且不修改原 schema", async () => {
  for (const schema of [RECOGNIZE_SCHEMA, MEAL_PLAN_SCHEMA, REUSE_PLAN_SCHEMA]) {
    const original = JSON.stringify(schema);
    await callCustomAI(config, { ...params, schema }, async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const sent = body.generationConfig.responseJsonSchema;
      assert.equal(JSON.stringify(sent).includes('"nullable":'), false);
      assert.deepEqual(sent.properties.data.anyOf[1], { type: "null" });
      assert.equal(sent.properties.data.anyOf[0].type, "object");
      const validator = z.fromJSONSchema(sent);
      assert.equal(validator.safeParse({ status: "needs_info", data: null, questions: [], warnings: [] }).success, true);
      if (schema === RECOGNIZE_SCHEMA) {
        const fields = sent.properties.data.anyOf[0].properties.candidates.items.properties;
        assert.deepEqual(fields.count, { anyOf: [{ type: "integer" }, { type: "null" }] });
        assert.deepEqual(fields.quantity, { anyOf: [{ type: "number" }, { type: "null" }] });
        assert.deepEqual(fields.unit, { anyOf: [{ type: "string", enum: ["g", "ml", "piece"] }, { type: "null" }] });
        const candidateValidator = z.fromJSONSchema(sent.properties.data.anyOf[0].properties.candidates.items);
        const candidate = { id: "resource-1", name: "青菜", kind: "ingredient", count: null, uncertain: true, quantity: null, unit: null };
        assert.equal(candidateValidator.safeParse(candidate).success, true);
        assert.equal(candidateValidator.safeParse({ ...candidate, count: 1.5 }).success, false);
        assert.equal(candidateValidator.safeParse({ ...candidate, unit: "kg" }).success, false);
      }
      assert.ok(body.systemInstruction.parts[0].text.includes(JSON.stringify(sent)));
      return geminiResponse();
    });
    assert.equal(JSON.stringify(schema), original);
  }
});

test("OpenAI 兼容提示使用相同标准 JSON Schema，名为 nullable 的业务字段得以保留", async () => {
  const schema = { type: "object", properties: { nullable: { type: "string", nullable: true } }, required: ["nullable"] };
  await callCustomAI({ ...config, provider: "openai-compatible" }, { ...params, schema }, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const expected = { type: "object", properties: { nullable: { anyOf: [{ type: "string" }, { type: "null" }] } }, required: ["nullable"] };
    assert.ok(body.messages[0].content.includes(JSON.stringify(expected)));
    return Response.json({ choices: [{ message: { content: '{"nullable":null}' } }] });
  });
});

test("支持域名、版本前缀与完整 endpoint，不重复拼接路径", async () => {
  const cases: [CustomAIConfig["provider"], string, string][] = [
    ["openai-compatible", "https://example.com", "https://example.com/v1/chat/completions"],
    ["openai-compatible", "https://example.com/api/v1/", "https://example.com/api/v1/chat/completions"],
    ["openai-compatible", "https://example.com/api/chat/completions", "https://example.com/api/chat/completions"],
    ["gemini", "https://example.com/v1beta", "https://example.com/v1beta/models/gemini-test:generateContent"],
    ["gemini", "https://example.com/v1beta/models/gemini-test:generateContent", "https://example.com/v1beta/models/gemini-test:generateContent"],
  ];
  for (const [provider, baseUrl, expected] of cases) {
    await callCustomAI({ ...config, provider, baseUrl }, params, async (url) => {
      assert.equal(url, expected);
      return provider === "gemini" ? geminiResponse() : Response.json({ choices: [{ message: { content: "{}" } }] });
    });
  }
  assert.throws(() => validateCustomAIConfig({ ...config, baseUrl: "https://example.com/v1beta/models/another:generateContent" }), /模型.*不一致/);
});

test("校验不泄漏地址或密钥，拒绝非 HTTPS 和 URL 内凭据", () => {
  for (const baseUrl of ["not-a-url-secret", "http://example.com", "https://user:secret@example.com", "https://example.com?key=secret", "https://example.com#secret", "https://example.com?"]) {
    assert.throws(() => validateCustomAIConfig({ ...config, baseUrl }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("secret"));
      return true;
    });
  }
  const clean = validateCustomAIConfig({ ...config, model: " gemini-test ", apiKey: " key ", baseUrl: " https://example.com/ " });
  assert.equal(clean.model, "gemini-test");
  assert.equal(clean.apiKey, "key");
  assert.equal(clean.baseUrl, "https://example.com");
});

test("鉴权、配额、网络错误只显示固定提示且绝不自动重试", async () => {
  for (const [status, pattern] of [[401, /密钥/], [403, /权限/], [429, /额度/], [400, /JSON/], [404, /找不到/]] as const) {
    let calls = 0;
    await assert.rejects(callCustomAI(config, params, async () => {
      calls++;
      return new Response("secret-provider-error", { status });
    }), pattern);
    assert.equal(calls, 1);
  }
  await assert.rejects(callCustomAI(config, params, async () => { throw new Error("secret-network-message"); }), (error: unknown) => {
    assert.ok(error instanceof Error && error.message.includes("CORS") && !error.message.includes("secret"));
    return true;
  });
});

test("拒绝空输出、被截断内容与无效 JSON，不掩盖模型失败", async () => {
  for (const payload of [
    { candidates: [] },
    { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "MAX_TOKENS" }] },
    { candidates: [{ content: { parts: [{ text: '文字\n```json\n{"ok":true}\n```' }] } }] },
  ]) {
    await assert.rejects(callCustomAI(config, params, async () => Response.json(payload)));
  }
  await assert.rejects(callCustomAI(config, params, async () => new Response("secret-non-json")), /接口未返回有效 JSON/);
});

test("忽略 Gemini 思考段并拼接内容，仅使用第一个候选", async () => {
  const text = await callCustomAI(config, params, async () => Response.json({ candidates: [
    { content: { parts: [{ thought: true, text: "internal reasoning" }, { text: '{"ok":' }, { text: "true}" }] } },
    { content: { parts: [{ text: "ignored" }] } },
  ] }));
  assert.equal(text, '{"ok":true}');
});

test("60 秒超时中断请求并返回固定提示", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | null | undefined;
  const request = callCustomAI(config, params, async (_url, init) => {
    signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("secret-timeout"))));
  });
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(60_000);
  await assert.rejects(request, /60 秒/);
  assert.equal(signal?.aborted, true);
});
