import { z } from "zod";

export const Unit = z.enum(["g", "ml", "piece"]);
export const Kind = z.enum(["ingredient", "material", "consumable", "tool"]);
export const Mode = z.enum(["meal", "reuse"]);
export type Unit = z.infer<typeof Unit>;
export type Kind = z.infer<typeof Kind>;
export type Mode = z.infer<typeof Mode>;

export const Candidate = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: Kind,
  count: z.number().int().positive().nullable(),
  uncertain: z.boolean(),
  quantity: z.number().finite().positive().nullable(),
  unit: Unit.nullable(),
}).refine((c) => (c.quantity === null) === (c.unit === null), {
  message: "数量与单位必须同时填写或同时为空",
}).refine((c) => c.unit !== "piece" || Number.isInteger(c.quantity), {
  message: "按个计量时数量必须为整数",
});
export type Candidate = z.infer<typeof Candidate>;

export const Resource = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().finite().positive(),
  unit: Unit,
  kind: Kind,
  available: z.boolean(),
  quantityEstimated: z.boolean().optional(),
});
export type Resource = z.infer<typeof Resource>;

export const Constraints = z.object({
  people: z.number().int().positive().optional(),
  maxMinutes: z.number().int().positive().default(30),
  dietaryAvoidances: z.array(z.string()).default([]),
  preferences: z.array(z.string()).default([]),
  maxExtras: z.number().int().min(0).max(8).default(0),
  equipmentNotes: z.array(z.string()).default([]),
});
export type Constraints = z.infer<typeof Constraints>;

export const Use = z.object({
  resourceId: z.string().min(1),
  quantity: z.number().finite().positive(),
  unit: Unit,
});
export type Use = z.infer<typeof Use>;

export const Step = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  resourceIds: z.array(z.string()).default([]),
  minutes: z.number().finite().nonnegative(),
});
export type Step = z.infer<typeof Step>;

export const Substitution = z.object({
  state: z.enum(["suggested", "applied"]),
  missingName: z.string().min(1),
  replacementResourceIds: z.array(z.string()).default([]),
  description: z.string().min(1),
  requiresReplan: z.boolean(),
});
export type Substitution = z.infer<typeof Substitution>;

export const Dish = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["staple", "side"]),
  servings: z.number().int().positive(),
  uses: z.array(Use).default([]),
  tools: z.array(z.string()).default([]),
  steps: z.array(Step).default([]),
});
export type Dish = z.infer<typeof Dish>;

export const TimelineItem = z.object({
  startMinute: z.number().finite().nonnegative(),
  endMinute: z.number().finite().positive(),
  action: z.string().min(1),
  dishIds: z.array(z.string()).default([]),
  toolIds: z.array(z.string()).default([]),
});

export const MealData = z.object({
  menu: z.object({ dishes: z.array(Dish) }),
  timeline: z.array(TimelineItem).default([]),
  extras: z.array(Resource).default([]),
  substitutions: z.array(Substitution).default([]),
  estimatedMinutes: z.number().finite().positive(),
  assumptions: z.array(z.string()).default([]),
});
export type MealData = z.infer<typeof MealData>;

export const ReusePlan = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  uses: z.array(Use).default([]),
  tools: z.array(z.string()).default([]),
  steps: z.array(Step).default([]),
  extras: z.array(Resource).default([]),
  estimatedMinutes: z.number().finite().positive(),
  checks: z.array(z.string()).default([]),
});
export type ReusePlan = z.infer<typeof ReusePlan>;

export const ReuseData = z.object({
  plans: z.array(ReusePlan),
  substitutions: z.array(Substitution).default([]),
  assumptions: z.array(z.string()).default([]),
});
export type ReuseData = z.infer<typeof ReuseData>;

export const ModelPayload = z.object({
  status: z.enum(["ready", "needs_info", "cannot_plan"]),
  data: z.unknown().nullable(),
  questions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface Envelope<T> {
  schemaVersion: "1.0";
  source: "gemini" | "demo";
  mode: Mode;
  status: "ready" | "needs_info" | "cannot_plan";
  warnings: string[];
  data: T | null;
  questions: string[];
  error: ApiError | null;
}

export function envelope<T>(mode: Mode, partial: Partial<Envelope<T>>): Envelope<T> {
  return {
    schemaVersion: "1.0",
    source: "gemini",
    mode,
    status: "cannot_plan",
    warnings: [],
    data: null,
    questions: [],
    error: null,
    ...partial,
  };
}
