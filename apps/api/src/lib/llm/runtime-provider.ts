// [daoyou-fork L1] fork-patch: local-llm
// 用 DeepSeek provider 的 OpenAI 兼容通道访问任意「OpenAI 形态」接口：
// 只需把 baseURL 指向本地服务（例如 http://172.20.0.2:7863/v1），
// 协议与官方一致，无需额外依赖。
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LanguageModel } from 'ai';
import {
  getRuntimeLlmConfig,
  type RuntimeLlmConfig,
} from '@server/lib/llm/runtime-config.js';

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

/** 转发用的最小模型形状：只借 doGenerate / doStream 与三个标识字段。 */
type DelegatingModel = {
  specificationVersion: string;
  provider: string;
  modelId: string;
  supportedUrls?: unknown;
  doGenerate: (options: unknown) => PromiseLike<unknown>;
  doStream: (options: unknown) => PromiseLike<unknown>;
};

/**
 * [daoyou-fork L1] fork-patch: local-llm
 * 上游 4c0d57c7 删掉了 aiClient.ts，模型注册收敛成 LlmModule 里的定值表，
 * 没有 per-request 解析点了。这里用一层转发模型把后台配置接回调用热路径：
 * 每次真正调用时重读运行时配置，启用就走本地接口，未启用照旧走传入的云端模型。
 */
export function createRuntimeLlmGate(fallback: LanguageModel): LanguageModel {
  const current = (): DelegatingModel => {
    const config = getRuntimeLlmConfig();
    const model = config ? createRuntimeLlmModel({ config }) : fallback;
    return model as unknown as DelegatingModel;
  };
  const gate: DelegatingModel = {
    get specificationVersion() {
      return current().specificationVersion;
    },
    get provider() {
      return current().provider;
    },
    get modelId() {
      return current().modelId;
    },
    get supportedUrls() {
      return current().supportedUrls;
    },
    doGenerate: (options) => current().doGenerate(options),
    doStream: (options) => current().doStream(options),
  };
  return gate as unknown as LanguageModel;
}
