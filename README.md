# 就地取材

**把家里已有的，变成今天用得上的。**

「就地取材」是一款生活资源再利用应用：拍下现有食材或闲置物品，确认清单后，得到一餐菜单或旧物改造方案。它把用量、步骤、制作顺序和缺料替代放在同一个流程里，帮助独居、合租用户减少重复采购与闲置浪费。

- [GitHub 仓库](https://github.com/yqia03/trae_gp)
- [GitHub Pages 静态演示入口](https://yqia03.github.io/trae_gp/)（已上线，已实测加载菜单）
- [项目说明与比赛展示稿](docs/PROJECT.md)

> GitHub Pages 提供静态演示，使用页面内明确标记的固定样例。图片识别与实时生成需要 Next.js 服务端和 Gemini 密钥，请按下方步骤运行完整版本。静态站不保存或提供 API 密钥。

## 可以做什么

| 功能 | 使用方式 |
| --- | --- |
| 今晚吃什么 | 上传食材图片或手动输入，设置人数、时间和忌口，生成菜单、用量与制作顺序。 |
| 自动估量 | 图片识别后填写大致重量、体积或个数；模型缺少估量时使用常见参考份量，清楚标注，可修改后一次确认。 |
| 常备食材仓库 | 增删油、盐、酱油等食材，编辑数量和单位；选中的条目参与生成，设置保存在当前浏览器，下次无需重复输入。 |
| 物品第二人生 | 为闲置物品提供可选择的改造方案，展示材料、工具、步骤和成品检查。 |
| 巧用替代 | 缺少材料时按已有资源重新规划，显示调整方法及其差异。 |
| 资源核算与执行 | 汇总方案用量、计算余量；展开并勾选步骤，也可复制文字方案。 |

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

完整 AI 版本需部署到支持 Node.js / Next.js 服务端的平台，并在部署环境设置上述变量。GitHub Pages 不能运行 `/api/recognize` 和 `/api/plan`。

## 一分钟演示

1. 点击顶部「加载演示样例 · 晚餐」，查看一餐菜单、菜品步骤、制作顺序和资源余量。
2. 展开「常备食材仓库」，新增一种调味品，修改数量或勾选状态；刷新后设置保留。
3. 点击「演示样例 · 旧物」，切换两个改造方案，查看对应资源占用。
4. 在本地完整版本中上传食材图片，展示自动估量和一次确认生成，观察「Gemini 实时生成」来源标记。

## 技术与数据说明

- Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、lucide-react。
- Google 官方 `@google/genai` SDK；Gemini 调用仅在服务端执行。
- Zod 校验输入与模型结构，并验证资源引用、用量、单位和约束；余量由应用计算。
- 不使用数据库或登录系统。常备仓库通过 `localStorage` 保存，仅限当前浏览器与站点，不跨设备同步；清除浏览器站点数据后会丢失。
- 图片会发送给 Google Gemini 识别；图片与密钥不写入 `localStorage`，密钥不进入前端与 Git。
- 图片估量属于参考，余量也据此计算；不能用于确认精确库存或食品安全。
- 「固定演示样例」为预先准备的数据，「Gemini 实时生成」为实际模型结果；请求失败会显示错误，不自动用样例冒充成功。

## 验证状态

本地已完成 23 项回归测试及 Webpack 生产构建；已验证食材自动估量后的真实菜单生成，以及常备仓库增删、修改和刷新保存。GitHub Pages 已上线，已在公网页面验证固定晚餐菜单加载；云端实时 Gemini 服务未部署。

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
