// [daoyou-fork L1] fork-patch: local-llm
// 用 DeepSeek provider 的 OpenAI 兼容通道访问任意「OpenAI 形态」接口：
// 只需把 baseURL 指向本地服务（例如 http://172.20.0.2:7863/v1），
// 协议与官方一致，无需额外依赖。
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LanguageModel } from 'ai';
import type { RuntimeLlmConfig } from '@server/lib/llm/runtime-config.js';

/** 本地接口默认不鉴权，但 SDK 要求非空 apiKey，这里给个占位值。 */
const NO_AUTH_PLACEHOLDER = 'local-no-auth';

export function createRuntimeLlmModel(params: {
  config: RuntimeLlmConfig;
  fetch?: typeof fetch;
}): LanguageModel {
  const { config, fetch } = params;
  const provider = createDeepSeek({
    apiKey: config.apiKey || NO_AUTH_PLACEHOLDER,
    baseURL: config.baseUrl,
    ...(fetch ? { fetch } : {}),
  });
  return provider(config.model);
}
