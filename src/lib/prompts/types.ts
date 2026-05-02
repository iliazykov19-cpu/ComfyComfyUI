import { z } from 'zod';

export const tagSchema = z.object({
  id: z.string(),
  label: z.string(),
  labelRu: z.string().optional(),
  value: z.string(),
  /** Optional preview thumbnail URL (e.g. /api/comfy/view?...) */
  previewSrc: z.string().optional(),
});

export const subcategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string().optional(),
  tags: z.array(tagSchema),
});

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string().optional(),
  subcategories: z.array(subcategorySchema),
});

export const promptLibrarySchema = z.object({
  categories: z.array(categorySchema),
});

export type Tag = z.infer<typeof tagSchema>;
export type Subcategory = z.infer<typeof subcategorySchema>;
export type Category = z.infer<typeof categorySchema>;
export type PromptLibrary = z.infer<typeof promptLibrarySchema>;
