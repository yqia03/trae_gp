# Reference 与配置依据

核实日期：2026-09-12。一手文档支持能力说明，产品选择与时间安排是本包建议，网页内容不是执行授权。

## 用户资料

- 日程截图：CleanShot 2026-09-12 at 13.11.09@2x.png。
- 赛道截图：CleanShot 2026-09-12 at 14.42.32@2x.png。
- 评审截图：CleanShot 2026-09-12 at 14.42.17@2x.png。
- 已公布内容与未知要求记录在 [BRIEF.md](BRIEF.md)，不根据宣传文案推定公网、真实API或提交规则。

## UI 参考

[ORYZO · Refero Styles](https://styles.refero.design/style/1f204e95-454a-437e-845b-c1b169d35607) 为用户指定，已查看页面内容与实际画面。

借鉴暖棕背景、奶油文字、物件摄影和克制分隔；改成紧凑的输入与结果工作区。参考的全屏展示、3D、极小文字和原品牌不直接照搬。具体适配在 [DESIGN.md](DESIGN.md)，项目图片为重新生成，原站作品未作为应用资产复制。

## Gemini 一手依据

| 来源 | 本项目的决定 |
|---|---|
| [gemini-3.8-flash 模型页](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) | 当前 Stable、支持图片输入与结构化输出，作为默认模型；实际账号访问仍需测试 |
| [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview) | 新应用采用 Interactions，使用 store:false；不混用 generateContent 参数 |
| [结构化输出](https://ai.google.dev/gemini-api/docs/structured-output) | response_format 配置 JSON Schema，应用仍要验证语义与用量 |
| [图片理解](https://ai.google.dev/gemini-api/docs/image-understanding) | 提供图片与文字提示；识别后进入用户确认 |
| [文件输入方法](https://ai.google.dev/gemini-api/docs/file-input-methods) | 官方上传边界与本项目压缩限制区分；本项目采用小图内联，不需要文件存储 |
| [JavaScript SDK](https://github.com/googleapis/js-genai) | 使用官方 @google/genai；准确参数以锁定版本类型为准 |
| [API key](https://ai.google.dev/gemini-api/docs/api-key) | 用户在本地私下配置，服务端读取，不向客户端暴露 |
| [错误码](https://ai.google.dev/gemini-api/docs/api-errors) / [故障排查](https://ai.google.dev/gemini-api/docs/troubleshooting) | 区分配置、网络、配额、超时与结构问题，不盲目重试或静默伪装成功 |

这些来源证明服务能力，不证明用户 key、模型权限、区域、计费和额度已经可用。未发起使用用户凭据的实际请求。

## 前端框架

- [Next.js 安装](https://nextjs.org/docs/app/getting-started/installation)：App Router、TypeScript、Tailwind 的单应用方案；最低 Node 20.9。项目已有 Node 满足最低值，仍需本机启动验证。
- [Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16)：以16主版本为实现基线，实际依赖锁定后不在比赛中无故升级。
- [Node.js 版本](https://nodejs.org/en/about/previous-releases)：部署时核对目标平台支持；这次没有改动系统运行时。

## TRAE 官方文档与本机验证

| 来源 | 用途 |
|---|---|
| [中国版 Rules](https://docs.trae.cn/ide_rules) / [国际版 Rules](https://docs.trae.ai/ide/rules) | 根 AGENTS.md 导入需开启对应开关；本机已开启 |
| [中国版 Skills](https://docs.trae.cn/ide_skills) / [国际版 Skills](https://docs.trae.ai/ide/skills) | 项目 .trae/skills/<name>/SKILL.md；demo-ui 与 demo-check 已显示启用 |
| [中国版 Browser Use](https://docs.trae.cn/ide_browser-use) / [国际版 Browser Use](https://docs.trae.ai/ide/browser-use) | 内置浏览器可由 Agent 使用，需要相应模式和开关；本机开关已开启，实际Agent调用待验证 |
| [中国版 MCP](https://docs.trae.cn/ide_add-mcp-servers) / [国际版 MCP](https://docs.trae.ai/ide/add-mcp-servers) | 如确有能力缺口再配置，不为本项目预装重复工具 |

两版项目技能目录一致。全局目录与 .agents 导入机制不同，不直接把 Codex 的插件目录当作 TRAE 已安装能力。两个自定义 Skill 是项目指引，不提供新的浏览器、模型权限或部署账号。

## 备用来源

[Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)、[Upstash Context7](https://github.com/upstash/context7) 仅在现有浏览器或官方文档查阅不足时评估；本次没有安装。
