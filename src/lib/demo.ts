// 固定演示样例：由 assets/demo/scenarios.json 适配为 MODEL_CONTRACT 统一契约。
// source=demo，不经过 Gemini；仅适用于本文件内的预置清单与约束。
import type { Constraints, Envelope, MealData, Resource, ReuseData } from "./types";

export const DEMO_MEAL_IMAGE = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/assets/demo/ingredients-input.png`;
export const DEMO_REUSE_IMAGE = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/assets/demo/objects-input.png`;

export const demoMealInventory: Resource[] = [
  { id: "tomato", name: "番茄", quantity: 300, unit: "g", kind: "ingredient", available: true },
  { id: "egg", name: "鸡蛋", quantity: 2, unit: "piece", kind: "ingredient", available: true },
  { id: "zucchini", name: "西葫芦", quantity: 200, unit: "g", kind: "ingredient", available: true },
  { id: "mushroom", name: "白蘑菇", quantity: 80, unit: "g", kind: "ingredient", available: true },
  { id: "rice", name: "生白米", quantity: 160, unit: "g", kind: "ingredient", available: true },
  { id: "oil", name: "食用油", quantity: 20, unit: "ml", kind: "consumable", available: true },
  { id: "salt", name: "食盐", quantity: 3, unit: "g", kind: "consumable", available: true },
  { id: "cooking-water", name: "烹饪用水", quantity: 500, unit: "ml", kind: "consumable", available: true },
  { id: "rice-pot", name: "带盖煮饭锅", quantity: 1, unit: "piece", kind: "tool", available: true },
  { id: "wok", name: "炒锅", quantity: 1, unit: "piece", kind: "tool", available: true },
];

export const demoMealConstraints: Constraints = {
  people: 2,
  maxMinutes: 30,
  dietaryAvoidances: [],
  preferences: [],
  maxExtras: 0,
  equipmentNotes: ["两个可同时使用的炉头"],
};

export const demoMealEnvelope: Envelope<MealData> = {
  schemaVersion: "1.0",
  source: "demo",
  mode: "meal",
  status: "ready",
  warnings: [
    "固定演示样例：分量为人工预置并已在样例中确认；真实使用时需逐项核对。",
    "估时 30 分钟为本样例约定，未经过实际烹饪验证。",
    "不声称营养充分；图片不能证明食材新鲜或可食用。",
  ],
  questions: [],
  error: null,
  data: {
    menu: {
      dishes: [
        {
          id: "plain-rice",
          name: "白米饭",
          role: "staple",
          servings: 2,
          uses: [
            { resourceId: "rice", quantity: 160, unit: "g" },
            { resourceId: "cooking-water", quantity: 240, unit: "ml" },
          ],
          tools: ["rice-pot"],
          steps: [
            { id: "s1", text: "量取 160g 生白米，淘洗沥水后放入带盖锅，加入 240ml 烹饪用水。", resourceIds: ["rice", "cooking-water"], minutes: 2 },
            { id: "s2", text: "加热至沸腾（约 4 分钟），转小火盖盖煮 14 分钟，再关火焖 7 分钟。", resourceIds: [], minutes: 25 },
            { id: "s3", text: "检查米粒熟透无硬芯，拨松分成两碗。", resourceIds: [], minutes: 2 },
          ],
        },
        {
          id: "tomato-eggs",
          name: "番茄炒蛋",
          role: "side",
          servings: 2,
          uses: [
            { resourceId: "tomato", quantity: 300, unit: "g" },
            { resourceId: "egg", quantity: 2, unit: "piece" },
            { resourceId: "oil", quantity: 10, unit: "ml" },
            { resourceId: "salt", quantity: 1, unit: "g" },
          ],
          tools: ["wok"],
          steps: [
            { id: "s1", text: "番茄洗净去蒂切块；2 个鸡蛋打入碗中搅匀，避免蛋壳混入。", resourceIds: ["tomato", "egg"], minutes: 4 },
            { id: "s2", text: "炒锅加 10ml 油，先用约一半将蛋液炒至凝固盛出。", resourceIds: ["oil"], minutes: 3 },
            { id: "s3", text: "余油下番茄炒至出汁变软，加入本菜分配的 1g 盐。", resourceIds: ["salt"], minutes: 3 },
            { id: "s4", text: "倒回炒蛋拌炒至整体热透后装盘；不额外添加未确认的糖、酱油或葱姜。", resourceIds: [], minutes: 2 },
          ],
        },
        {
          id: "zucchini-mushrooms",
          name: "清炒西葫芦蘑菇",
          role: "side",
          servings: 2,
          uses: [
            { resourceId: "zucchini", quantity: 200, unit: "g" },
            { resourceId: "mushroom", quantity: 80, unit: "g" },
            { resourceId: "oil", quantity: 8, unit: "ml" },
            { resourceId: "salt", quantity: 1, unit: "g" },
          ],
          tools: ["wok"],
          steps: [
            { id: "s1", text: "西葫芦、白蘑菇清洗后切薄片。", resourceIds: ["zucchini", "mushroom"], minutes: 4 },
            { id: "s2", text: "番茄炒蛋装盘后清理炒锅，加 8ml 油，先下蘑菇翻炒至变软。", resourceIds: ["oil"], minutes: 3 },
            { id: "s3", text: "加入西葫芦炒至熟，加 1g 盐调味装盘；以实际熟度为准。", resourceIds: ["salt"], minutes: 4 },
          ],
        },
      ],
    },
    timeline: [
      { startMinute: 0, endMinute: 2, action: "核对清单，量取淘洗白米下锅", dishIds: ["plain-rice"], toolIds: ["rice-pot"] },
      { startMinute: 2, endMinute: 6, action: "炉头一煮米水；同时清洗蔬菜", dishIds: ["plain-rice"], toolIds: ["rice-pot"] },
      { startMinute: 6, endMinute: 8, action: "小火煮饭；切菜、打蛋、量取油盐", dishIds: ["plain-rice", "tomato-eggs"], toolIds: ["rice-pot"] },
      { startMinute: 8, endMinute: 16, action: "炉头二完成番茄炒蛋；炉头一继续煮饭", dishIds: ["tomato-eggs", "plain-rice"], toolIds: ["wok", "rice-pot"] },
      { startMinute: 16, endMinute: 25, action: "炉头二完成清炒西葫芦蘑菇；约 20 分钟关火焖饭", dishIds: ["zucchini-mushrooms", "plain-rice"], toolIds: ["wok", "rice-pot"] },
      { startMinute: 25, endMinute: 30, action: "检查熟度，分装摆盘", dishIds: ["plain-rice", "tomato-eggs", "zucchini-mushrooms"], toolIds: [] },
    ],
    extras: [],
    substitutions: [
      {
        state: "applied",
        missingName: "蚝油",
        replacementResourceIds: ["salt"],
        description: "没有蚝油，改用现有食盐做清炒版：1g 盐已计入西葫芦蘑菇用量，不再重复扣除；成菜更清淡，与蚝油版风味不同。",
        requiresReplan: false,
      },
    ],
    estimatedMinutes: 30,
    assumptions: [
      "估时 30 分钟基于两个炉头并行，未经过实际烹饪验证。",
      "米种与锅具流程以包装说明和实际熟度为准。",
    ],
  },
};

export const demoReuseInventory: Resource[] = [
  { id: "glass-jar", name: "空无盖玻璃罐", quantity: 1, unit: "piece", kind: "material", available: true },
  { id: "shoe-box", name: "无盖鞋盒", quantity: 1, unit: "piece", kind: "material", available: true },
  { id: "cotton-cloth", name: "米色棉布", quantity: 1, unit: "piece", kind: "material", available: true },
  { id: "desk", name: "平稳桌面", quantity: 1, unit: "piece", kind: "tool", available: true },
];

export const demoReuseConstraints: Constraints = {
  maxMinutes: 30,
  dietaryAvoidances: [],
  preferences: [],
  maxExtras: 0,
  equipmentNotes: ["干燥稳定的桌面", "现有自然光或室内光线"],
};

export const demoReuseEnvelope: Envelope<ReuseData> = {
  schemaVersion: "1.0",
  source: "demo",
  mode: "reuse",
  status: "ready",
  warnings: [
    "固定演示样例：两件方案互斥，一次只选一种，不累计占用。",
    "罐体无裂纹、盒子干燥等状态需用户自行检查，不从图片判断。",
    "仅用于非食品小物；不涉及玻璃切割或电器改造。",
  ],
  questions: [],
  error: null,
  data: {
    plans: [
      {
        id: "entry-organizer",
        title: "玄关随手收纳台",
        uses: [
          { resourceId: "shoe-box", quantity: 1, unit: "piece" },
          { resourceId: "cotton-cloth", quantity: 1, unit: "piece" },
          { resourceId: "glass-jar", quantity: 1, unit: "piece" },
        ],
        tools: ["desk"],
        steps: [
          { id: "s1", text: "检查鞋盒干燥完整、玻璃罐无裂纹缺口，将鞋盒开口向上放在稳定桌面。", resourceIds: ["shoe-box", "glass-jar"], minutes: 1 },
          { id: "s2", text: "把整块棉布折到适合盒底大小，平整铺入鞋盒；不裁剪。", resourceIds: ["cotton-cloth"], minutes: 2 },
          { id: "s3", text: "玻璃罐放在盒内一角，确保布面平整、罐体不晃动。", resourceIds: ["glass-jar"], minutes: 2 },
          { id: "s4", text: "罐内收纳已有的笔等轻小非食品用品，旁边放钥匙等小物。", resourceIds: [], minutes: 3 },
        ],
        extras: [],
        estimatedMinutes: 8,
        checks: [
          "同一个盒内只使用一只罐和一整块布。",
          "罐体稳定，所有容器仅用于非食品小物。",
          "不需要玻璃切割、钻孔、加热或电器改造。",
        ],
      },
      {
        id: "small-photo-stage",
        title: "桌面小物拍照台",
        uses: [
          { resourceId: "shoe-box", quantity: 1, unit: "piece" },
          { resourceId: "cotton-cloth", quantity: 1, unit: "piece" },
        ],
        tools: ["desk"],
        steps: [
          { id: "s1", text: "鞋盒开口向下放在稳定桌面，确认盒底平稳支撑轻小物品。", resourceIds: ["shoe-box"], minutes: 1 },
          { id: "s2", text: "整块棉布平铺在朝上的盒底，余布自然垂下，理平主要拍摄区域。", resourceIds: ["cotton-cloth"], minutes: 2 },
          { id: "s3", text: "靠近现有光线摆好底座，放入已有轻小物品，用已有手机取景。", resourceIds: [], minutes: 2 },
          { id: "s4", text: "调整角度拍一张检查背景；玻璃罐本方案不用，保留为未占用资源。", resourceIds: [], minutes: 1 },
        ],
        extras: [],
        estimatedMinutes: 6,
        checks: [
          "只占用一个鞋盒和一块棉布，玻璃罐仍可用。",
          "底座稳定，不放重物或食品。",
          "已有手机能拍到背景整洁的照片。",
        ],
      },
    ],
    substitutions: [
      {
        state: "applied",
        missingName: "胶水或胶带",
        replacementResourceIds: [],
        description: "不购买胶水：通过盒壁容纳、整块衬布平铺和稳定放置实现免粘合组合；适合桌面静置，不适合拎起晃动。",
        requiresReplan: false,
      },
    ],
    assumptions: ["两方案均只用已确认三件旧物，不依赖额外材料。"],
  },
};

// 胶水验收夹具：初始结果依赖额外胶水，点击“这项没有”后由前端切换为免粘合成功参考。
export const demoGlueFixtureEnvelope: Envelope<ReuseData> = {
  schemaVersion: "1.0",
  source: "demo",
  mode: "reuse",
  status: "ready",
  warnings: ["固定验收夹具：胶水为未拥有的补购项，补齐前不得执行。"],
  questions: [],
  error: null,
  data: {
    plans: [
      {
        id: "glue-organizer",
        title: "胶粘固定收纳款（验收夹具）",
        uses: [
          { resourceId: "glass-jar", quantity: 1, unit: "piece" },
          { resourceId: "shoe-box", quantity: 1, unit: "piece" },
          { resourceId: "cotton-cloth", quantity: 1, unit: "piece" },
        ],
        tools: ["desk"],
        steps: [
          { id: "s1", text: "检查三件旧物状态，鞋盒开口向上放稳。", resourceIds: ["shoe-box"], minutes: 1 },
          { id: "s2", text: "裁剪棉布后需以 5ml 胶水粘合固定于盒内（依赖补购胶水）。", resourceIds: ["cotton-cloth", "glue"], minutes: 5 },
          { id: "s3", text: "将玻璃罐粘定于盒角，等待胶水固化。", resourceIds: ["glass-jar", "glue"], minutes: 6 },
        ],
        extras: [
          { id: "glue", name: "胶水", quantity: 5, unit: "ml", kind: "consumable", available: false },
        ],
        estimatedMinutes: 12,
        checks: ["胶水补齐前不得执行。", "仅用于非食品小物。"],
      },
    ],
    substitutions: [],
    assumptions: ["本结果依赖额外胶水；未取得前不可执行。"],
  },
};
