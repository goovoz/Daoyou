// [daoyou-fork L1] fork-patch: local-llm —— 后台模型配置入参
import { z } from 'zod';

export const SaveLlmConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().max(512).default(''),
  apiKey: z.string().max(512).default(''),
  model: z.string().max(200).default(''),
});

/** 探测（读模型列表 / 连通性测试）可临时覆盖地址与密钥，不落库。 */
export const LlmProbeSchema = z.object({
  baseUrl: z.string().max(512).optional(),
  apiKey: z.string().max(512).optional(),
  model: z.string().max(200).optional(),
});

export type SaveLlmConfigInput = z.infer<typeof SaveLlmConfigSchema>;
export type LlmProbeInput = z.infer<typeof LlmProbeSchema>;
