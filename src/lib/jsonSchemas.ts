// JSON Schemas passed to Gemini via response_format.schema (OpenAPI 3.0 subset).

const candidateSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    kind: { type: "string", enum: ["ingredient", "material", "consumable", "tool"] },
    count: { type: "integer", nullable: true },
    uncertain: { type: "boolean" },
    quantity: { type: "number", nullable: true },
    unit: { type: "string", enum: ["g", "ml", "piece"], nullable: true },
  },
  required: ["id", "name", "kind", "count", "uncertain", "quantity", "unit"],
};

export const RECOGNIZE_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ready", "needs_info", "cannot_plan"] },
    data: {
      type: "object",
      nullable: true,
      properties: {
        candidates: { type: "array", items: candidateSchema },
      },
      required: ["candidates"],
    },
    questions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["status", "data", "questions", "warnings"],
};

const useSchema = {
  type: "object",
  properties: {
    resourceId: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string", enum: ["g", "ml", "piece"] },
  },
  required: ["resourceId", "quantity", "unit"],
};

const stepSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    text: { type: "string" },
    resourceIds: { type: "array", items: { type: "string" } },
    minutes: { type: "number" },
  },
  required: ["id", "text", "resourceIds", "minutes"],
};

const resourceSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string", enum: ["g", "ml", "piece"] },
    kind: { type: "string", enum: ["ingredient", "material", "consumable", "tool"] },
    available: { type: "boolean" },
  },
  required: ["id", "name", "quantity", "unit", "kind", "available"],
};

const substitutionSchema = {
  type: "object",
  properties: {
    state: { type: "string", enum: ["suggested", "applied"] },
    missingName: { type: "string" },
    replacementResourceIds: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    requiresReplan: { type: "boolean" },
  },
  required: ["state", "missingName", "replacementResourceIds", "description", "requiresReplan"],
};

const dishSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    role: { type: "string", enum: ["staple", "side"] },
    servings: { type: "integer" },
    uses: { type: "array", items: useSchema },
    tools: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: stepSchema },
  },
  required: ["id", "name", "role", "servings", "uses", "tools", "steps"],
};

const timelineSchema = {
  type: "object",
  properties: {
    startMinute: { type: "number" },
    endMinute: { type: "number" },
    action: { type: "string" },
    dishIds: { type: "array", items: { type: "string" } },
    toolIds: { type: "array", items: { type: "string" } },
  },
  required: ["startMinute", "endMinute", "action", "dishIds", "toolIds"],
};

export const MEAL_PLAN_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ready", "needs_info", "cannot_plan"] },
    data: {
      type: "object",
      nullable: true,
      properties: {
        menu: {
          type: "object",
          properties: { dishes: { type: "array", items: dishSchema } },
          required: ["dishes"],
        },
        timeline: { type: "array", items: timelineSchema },
        extras: { type: "array", items: resourceSchema },
        substitutions: { type: "array", items: substitutionSchema },
        estimatedMinutes: { type: "number" },
        assumptions: { type: "array", items: { type: "string" } },
      },
      required: ["menu", "timeline", "extras", "substitutions", "estimatedMinutes", "assumptions"],
    },
    questions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["status", "data", "questions", "warnings"],
};

const reusePlanSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    uses: { type: "array", items: useSchema },
    tools: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: stepSchema },
    extras: { type: "array", items: resourceSchema },
    estimatedMinutes: { type: "number" },
    checks: { type: "array", items: { type: "string" } },
  },
  required: ["id", "title", "uses", "tools", "steps", "extras", "estimatedMinutes", "checks"],
};

export const REUSE_PLAN_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ready", "needs_info", "cannot_plan"] },
    data: {
      type: "object",
      nullable: true,
      properties: {
        plans: { type: "array", items: reusePlanSchema },
        substitutions: { type: "array", items: substitutionSchema },
        assumptions: { type: "array", items: { type: "string" } },
      },
      required: ["plans", "substitutions", "assumptions"],
    },
    questions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["status", "data", "questions", "warnings"],
};
