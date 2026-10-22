// [daoyou-fork L1] fork-patch: local-llm
// 运行时可切换的 LLM 配置：指向本地部署的 OpenAI 兼容接口（如 workbuddy2api）。
// 存在 app_settings 里，后台可改，改完立即生效，无需重启。
import { z } from 'zod';
import {
  getAppSetting,
  upsertAppSetting,
} from '@server/lib/repositories/appSettingsRepository.js';
import { APP_SETTING_KEYS } from '@server/lib/repositories/app-settings-config.js';

/** 后台首次打开时的默认模型。 */
export const DEFAULT_RUNTIME_LLM_MODEL = 'deepseek-v4.1-flash';

export const RuntimeLlmConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
});

export type RuntimeLlmConfig = z.infer<typeof RuntimeLlmConfigSchema>;

const EMPTY_CONFIG: RuntimeLlmConfig = {
  enabled: false,
  baseUrl: '',
  apiKey: '',
  model: DEFAULT_RUNTIME_LLM_MODEL,
};

let cachedConfig: RuntimeLlmConfig | null = null;
let loaded = false;

/**
 * 归一化接口地址：
 * - 缺协议时补 http://
 * - 去掉尾部斜杠
 * - 末尾没有 /vN 时补 /v1（OpenAI 兼容惯例）
 */
export function normalizeLlmBaseUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  url = url.replace(/\/+$/, '');
  if (!/\/v\d+$/i.test(url)) {
    url = `${url}/v1`;
  }
  return url;
}

/** 同步读取（供 LLM 调用热路径使用）。未加载或未启用时返回 null，回落到环境变量。 */
export function getRuntimeLlmConfig(): RuntimeLlmConfig | null {
  if (!loaded || !cachedConfig) return null;
  if (!cachedConfig.enabled) return null;
  if (!cachedConfig.baseUrl || !cachedConfig.model) return null;
  return cachedConfig;
}

/** 供后台展示用：不判断 enabled，直接看存了什么。 */
export function getStoredRuntimeLlmConfig(): RuntimeLlmConfig {
  return cachedConfig ?? { ...EMPTY_CONFIG };
}

export async function loadRuntimeLlmConfig(
  force = false,
): Promise<RuntimeLlmConfig> {
  if (loaded && !force) return cachedConfig ?? { ...EMPTY_CONFIG };

  try {
    const raw = await getAppSetting(APP_SETTING_KEYS.runtimeLlm);
    if (!raw) {
      cachedConfig = { ...EMPTY_CONFIG };
    } else {
      const parsed = RuntimeLlmConfigSchema.safeParse(JSON.parse(raw));
      cachedConfig = parsed.success
        ? {
            ...parsed.data,
            model: parsed.data.model.trim() || DEFAULT_RUNTIME_LLM_MODEL,
          }
        : { ...EMPTY_CONFIG };
    }
  } catch {
    cachedConfig = { ...EMPTY_CONFIG };
  }

  loaded = true;
  return cachedConfig;
}

export async function saveRuntimeLlmConfig(params: {
  config: RuntimeLlmConfig;
  updatedBy: string;
}): Promise<RuntimeLlmConfig> {
  const baseUrl = normalizeLlmBaseUrl(params.config.baseUrl);
  const model = params.config.model.trim() || DEFAULT_RUNTIME_LLM_MODEL;
  const apiKey = params.config.apiKey.trim();

  if (params.config.enabled && !baseUrl) {
    throw new Error('启用本地接口时必须填写接口地址');
  }
  if (params.config.enabled && !model) {
    throw new Error('启用本地接口时必须选择模型');
  }

  const next: RuntimeLlmConfig = {
    enabled: params.config.enabled,
    baseUrl,
    apiKey,
    model,
  };

  await upsertAppSetting({
    key: APP_SETTING_KEYS.runtimeLlm,
    value: JSON.stringify(next),
    updatedBy: params.updatedBy,
  });

  cachedConfig = next;
  loaded = true;
  return next;
}

/** 日志与后台展示用，避免把完整密钥写出去。 */
export function maskLlmApiKey(apiKey: string): string {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '********';
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}
