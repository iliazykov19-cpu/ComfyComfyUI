import { z } from 'zod';
import { apiWorkflowSchema } from '@/lib/workflow/types';

export const seedControlSchema = z.enum([
  'fixed',
  'randomize',
  'increment',
  'decrement',
]);

export const cardColorSchema = z.enum([
  'default',
  'slate',
  'red',
  'orange',
  'amber',
  'lime',
  'emerald',
  'cyan',
  'blue',
  'violet',
  'pink',
]);

export const presetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(''),
  createdAt: z.number(),
  updatedAt: z.number(),
  workflow: apiWorkflowSchema,
  workflowName: z.string().default(''),
  exposed: z.array(z.string()),
  values: z.record(z.string(), z.unknown()),
  seedControls: z.record(z.string(), seedControlSchema),
  nodeOrder: z.array(z.string()).default([]),
  nodeColors: z.record(z.string(), cardColorSchema).default({}),
  promptTargets: z.array(z.string()).default([]),
});

export type Preset = z.infer<typeof presetSchema>;

export type PresetSummary = Pick<
  Preset,
  'id' | 'name' | 'description' | 'createdAt' | 'updatedAt' | 'workflowName'
> & {
  exposedCount: number;
  nodeCount: number;
};

export const newPresetInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional().default(''),
  workflow: apiWorkflowSchema,
  workflowName: z.string().default(''),
  exposed: z.array(z.string()),
  values: z.record(z.string(), z.unknown()),
  seedControls: z.record(z.string(), seedControlSchema),
  nodeOrder: z.array(z.string()).optional().default([]),
  nodeColors: z.record(z.string(), cardColorSchema).optional().default({}),
  promptTargets: z.array(z.string()).optional().default([]),
});

export const updatePresetInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  workflow: apiWorkflowSchema.optional(),
  workflowName: z.string().optional(),
  exposed: z.array(z.string()).optional(),
  values: z.record(z.string(), z.unknown()).optional(),
  seedControls: z.record(z.string(), seedControlSchema).optional(),
  nodeOrder: z.array(z.string()).optional(),
  nodeColors: z.record(z.string(), cardColorSchema).optional(),
  promptTargets: z.array(z.string()).optional(),
});
