# 就地取材 · TRAE 比赛 Demo

> **已停止维护。** 本项目于 2026 年 9 月 12 日为 TRAE 比赛制作，现仅保留在仓库中，供作品展示与代码参考。自 2026 年 9 月 13 日起，不再更新功能、修复问题或提供维护支持。

「就地取材」是一个生活资源再利用 Demo：拍照或手动录入家里的食材、闲置物品，确认清单后，生成晚餐菜单或旧物改造方案，展示材料用量、操作步骤和缺料替代。

- [GitHub 仓库](https://github.com/yqia03/trae_gp)
- [比赛在线演示](https://yqia03.github.io/trae_gp/)（GitHub Pages，保留比赛版本）

## 保留的演示功能

- 食材识别、参考用量估算、菜单生成与资源余量核算。
- 旧物改造方案、步骤勾选和缺料替代。
- 常备食材仓库，在当前浏览器保存设置。
- 固定演示样例，以及 Gemini 原生 / OpenAI 兼容自定义 AI 接口。

固定样例可直接加载。真实 AI 功能需要自行配置接口、模型与密钥，接口可用性不再维护。在线演示通过浏览器直连自定义 HTTPS 接口，要求接口允许跨域访问（CORS）；配置与密钥只保存在当前页面内存中，刷新后清除。仓库不提供公共 API Key 或托管 AI 后端。

样例图片由 AI 生成；图片估量仅供参考，不能确认精确库存或食品安全。固定样例与真实 AI 结果分开标记，请求失败不会自动伪装为样例成功。

## 本地运行

保留版本使用 Node.js 22.18+ 和 npm：

```bash
git clone https://github.com/yqia03/trae_gp.git
cd trae_gp
npm ci
npm run dev
```

打开 [本地演示](http://localhost:3000)。无需密钥即可加载固定样例。

如需使用默认 Gemini 服务端，在根目录 `.env.local` 中自行设置 `GEMINI_API_KEY` 和 `GEMINI_MODEL`，然后重启服务；模型名称应填写自己账号可用的型号。也可以在页面的「AI 接口设置」中填写自定义配置。

保留的检查与构建命令：

```bash
npm test
npm run lint
npm run build -- --webpack
npm start
npm run build:pages
```

`build:pages` 导出静态文件到 `out/`，不包含服务端 API；默认 Gemini 服务端需要在支持 Node.js / Next.js 的环境运行。

## 仓库内容

- `src/`：Next.js 页面、API、模型调用、资源校验、固定样例与测试。
- `public/assets/`：应用实际使用的品牌图与两张演示输入图。
- `scripts/build-pages.mjs`：GitHub Pages 静态导出脚本。
- 根目录配置与锁文件：保留比赛版本的运行和构建环境。

技术栈为 Next.js 16、React 19、TypeScript、Tailwind CSS 4、Zod 与 `@google/genai`，无数据库或账号系统。过期比赛执行资料、重复资产与未使用的脚手架文件已清理；原始资料与生成记录仍可从 Git 历史查阅。
