# 就地取材

**把家里已有的，变成今天用得上的。**

「就地取材」是一款生活资源再利用应用：拍下现有食材或闲置物品，确认清单后，得到一餐菜单或旧物改造方案。它把用量、步骤、制作顺序和缺料替代放在同一个流程里，帮助独居、合租用户减少重复采购与闲置浪费。

- [GitHub 仓库](https://github.com/yqia03/trae_gp)
- [GitHub Pages 在线演示](https://yqia03.github.io/trae_gp/)（静态托管，可配置自己的 AI 接口）
- [项目说明与比赛展示稿](docs/PROJECT.md)

> GitHub Pages 在线版支持固定样例，也支持在「AI 接口设置」中填入自己的接口和密钥，由浏览器直接调用 AI 识别图片、生成方案。本站没有托管 AI 后端或提供公共密钥；本地运行时仍默认使用 Gemini 服务端。

## 可以做什么

| 功能 | 使用方式 |
| --- | --- |
| 今晚吃什么 | 上传食材图片或手动输入，设置人数、时间和忌口，生成菜单、用量与制作顺序。 |
| 自动估量 | 图片识别后填写大致重量、体积或个数；模型缺少估量时使用常见参考份量，清楚标注，可修改后一次确认。 |
| 常备食材仓库 | 增删油、盐、酱油等食材，编辑数量和单位；选中的条目参与生成，设置保存在当前浏览器，下次无需重复输入。 |
| 物品第二人生 | 为闲置物品提供可选择的改造方案，展示材料、工具、步骤和成品检查。 |
| 巧用替代 | 缺少材料时按已有资源重新规划，显示调整方法及其差异。 |
| 资源核算与执行 | 汇总方案用量、计算余量；展开并勾选步骤，也可复制文字方案。 |
| 自定义 AI 接口 | 选择 Gemini 原生或 OpenAI 兼容接口，填写 HTTPS 地址、模型和自己的 API Key，启用或测试连接后使用。 |

## 在线使用自己的 AI 接口

1. 打开 [在线演示](https://yqia03.github.io/trae_gp/)，展开「AI 接口设置」。
2. 选择「Gemini 原生」或「OpenAI 兼容」，填写 API 地址、该接口支持的模型名称和自己的 API Key。
3. 点击启用接口，或点击「测试连接」；测试成功也会启用该配置。
4. 上传图片识别或手动录入资源，确认后生成。结果标记为「自定义 AI 实时生成」。

| 接口类型 | API 地址填写示例 | 模型要求 |
| --- | --- | --- |
| Gemini 原生 | `https://generativelanguage.googleapis.com/v1beta` | 填写自己的账号可用的 Gemini 模型；识别图片时需支持图片输入。 |
| OpenAI 兼容 | `https://api.openai.com/v1` 或 `https://api.openai.com/v1/chat/completions` | 填写服务商支持的模型名，需支持 JSON 输出；识别图片时还需视觉能力。 |

接口必须允许浏览器跨域访问（CORS）。如使用其他兼容服务，将示例地址替换为该服务提供的 HTTPS 地址；接口无法被浏览器访问时，页面会显示连接错误。

自定义配置和密钥仅保存在当前页面内存中，刷新即清除；切换接口类型或修改地址会清空密钥。点击「清除密钥并关闭」可退出自定义接口。密钥不写入浏览器持久存储或 Git；调用时由浏览器把密钥、图片和输入直接发送到所填接口，请使用自己信任的地址。

## 立即运行完整 AI 版本

建议使用 Node.js 22.18+（测试使用 Node 原生 TypeScript 支持）和 npm。

```bash
git clone https://github.com/yqia03/trae_gp.git
cd trae_gp
npm install
```

在项目根目录创建 `.env.local`，填写自己的配置：

```dotenv
GEMINI_API_KEY=填写你的密钥
GEMINI_MODEL=gemini-3.8-flash
```

```bash
npm run dev
```

打开 [本地网站](http://localhost:3000)。修改环境变量后需重启服务。未配置密钥时仍可查看界面和加载固定演示样例。

```bash
# 回归测试
npm test

# 生产构建与启动
npm run build -- --webpack
npm start

# 导出 GitHub Pages 静态演示到 out/
npm run build:pages
```

默认 Gemini 服务端需在本地或支持 Node.js / Next.js 的平台运行，并设置上述环境变量。GitHub Pages 不能运行 `/api/recognize` 和 `/api/plan`，在线版启用自定义接口后通过浏览器直连提供真实 AI 功能。

## 一分钟演示

1. 点击顶部「加载演示样例 · 晚餐」，查看一餐菜单、菜品步骤、制作顺序和资源余量。
2. 展开「常备食材仓库」，新增一种调味品，修改数量或勾选状态；刷新后设置保留。
3. 点击「演示样例 · 旧物」，切换两个改造方案，查看对应资源占用。
4. 在线版配置自己的 AI 接口，或运行本地默认 Gemini 服务端；上传食材图片，展示自动估量和一次确认生成，观察对应的实时生成来源标记。

## 技术与数据说明

- Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、lucide-react。
- 默认 Gemini 模式通过 Google 官方 `@google/genai` SDK 在服务端执行；自定义模式由浏览器直连 Gemini 原生或 OpenAI 兼容接口。
- 默认服务端与自定义接口共享 Zod 结构及资源校验规则，验证资源引用、用量、单位和约束；余量由应用计算。
- 不使用数据库或登录系统。常备仓库通过 `localStorage` 保存，仅限当前浏览器与站点，不跨设备同步；清除浏览器站点数据后会丢失。
- 默认模式将图片发送给 Gemini，服务端环境变量密钥不进入前端；自定义模式将图片和用户填写的密钥直接发给指定接口。两种模式均不把图片或密钥写入 `localStorage` 或 Git。
- 图片估量属于参考，余量也据此计算；不能用于确认精确库存或食品安全。
- 来源分为「固定演示样例」、「Gemini 实时生成」和「自定义 AI 实时生成」（`source: custom`）；请求失败会显示错误，不自动回退样例。

## 验证状态

本次自定义接口更新已通过 36 项测试和 TypeScript 类型检查；lint 无错误，保留 2 条既有图片标签警告。本次 Webpack 生产构建与 Pages 静态构建通过；已在浏览器验证接口设置、密钥清除与连接失败提示。使用真实自定义 Key 的连接、识别及生成尚未实测。

此前已通过 Webpack 生产构建，并验证默认 Gemini 服务端的真实菜单生成、常备仓库增删修改和刷新保存，以及 GitHub Pages 固定晚餐菜单加载。本站没有托管云端 AI 后端。

## 项目结构与原始资料

- `src/app/page.tsx`：双场景界面与交互。
- `src/app/api/recognize/route.ts`、`src/app/api/plan/route.ts`：服务端识别与生成。
- `src/lib/`：类型、模型调用、提示词、资源验证、估量、常备仓库及测试。
- `public/assets/`：应用使用的图片；`assets/`：原创资产、生成记录和固定演示数据。
- `docs/PROJECT.md`：作品介绍与展示说明；`docs/competition/`：比赛规格与实施参考。

原始准备资料保留供追溯，具体实现与用户现场修订优先：

- [开始交接](docs/competition/START_HERE.md) · [TRAE 开工提示词](docs/competition/PROMPTS.md)
- [产品规格](docs/competition/BRIEF.md)
- [视觉规范](docs/competition/DESIGN.md) · [界面概念图](assets/reference/ui-desktop-concept.png)
- [Gemini 接口契约](docs/competition/MODEL_CONTRACT.md) · [模型提示词](docs/competition/LLM_PROMPTS.md)
- [演示与验收](docs/competition/DEMO.md) · [固定演示数据](assets/demo/scenarios.json)
- [100 分钟安排](docs/competition/TEAM.md) · [环境准备](docs/competition/PREP.md)
- [素材清单](assets/manifest.json) · [图像生成记录](assets/GENERATION_PROMPTS.md)
- [来源](docs/competition/REFERENCES.md) · [Agent 指引](AGENTS.md)

TRAE 的 `demo-ui`、`demo-check` Skill 位于 `.trae/skills/`。
