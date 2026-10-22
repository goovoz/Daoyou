// [daoyou-fork L1] fork-patch: local-llm
// 后台「模型配置」：把 LLM 指到本地 OpenAI 兼容接口，可读模型列表、可测连通性。
import { HttpException, Injectable, type OnModuleInit } from '@nestjs/common';
import type { AuthUser } from '@server/lib/auth/types.js';
import { getRuntimeEnvironment } from '@server/lib/config/environment.js';
import {
  DEFAULT_RUNTIME_LLM_MODEL,
  getRuntimeLlmConfig,
  getStoredRuntimeLlmConfig,
  loadRuntimeLlmConfig,
  maskLlmApiKey,
  normalizeLlmBaseUrl,
  saveRuntimeLlmConfig,
} from '@server/lib/llm/runtime-config.js';
import { LLM_PROVIDER_DEFAULT_MODELS } from '@daoyou/contracts/llm/config';
import type { LlmProviderId } from '@daoyou/contracts/llm/config';
import type { LlmProbeInput, SaveLlmConfigInput } from './llm-config-input.js';

const PROBE_TIMEOUT_MS = 20_000;

type NormalizedProbe = {
  baseUrl: string;
  apiKey: string;
  model?: string;
};

@Injectable()
export class AdminLlmConfigService implements OnModuleInit {
  async onModuleInit() {
    try {
      await loadRuntimeLlmConfig(true);
    } catch {
      // 配置读取失败不阻塞启动，回落到环境变量
    }
  }

  async getConfig() {
    const stored = getStoredRuntimeLlmConfig();
    const runtime = getRuntimeLlmConfig();

    return {
      success: true as const,
      data: {
        stored: {
          enabled: stored.enabled,
          baseUrl: stored.baseUrl,
          model: stored.model,
          hasApiKey: Boolean(stored.apiKey),
          apiKeyMasked: maskLlmApiKey(stored.apiKey),
        },
        effective: this.describeEffective(runtime),
        defaultModel: DEFAULT_RUNTIME_LLM_MODEL,
      },
    };
  }

  async saveConfig(user: AuthUser, input: SaveLlmConfigInput) {
    try {
      const saved = await saveRuntimeLlmConfig({
        config: {
          enabled: input.enabled,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
          model: input.model,
        },
        updatedBy: user.id,
      });
      return {
        success: true as const,
        data: {
          stored: {
            enabled: saved.enabled,
            baseUrl: saved.baseUrl,
            model: saved.model,
            hasApiKey: Boolean(saved.apiKey),
            apiKeyMasked: maskLlmApiKey(saved.apiKey),
          },
          effective: this.describeEffective(getRuntimeLlmConfig()),
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error instanceof Error ? error.message : '保存失败',
        },
        400,
      );
    }
  }

  /** 读取本地接口暴露的模型列表。 */
  async listModels(input: LlmProbeInput) {
    const probe = this.resolveProbe(input);
    const url = `${probe.baseUrl}/models`;
    const response = await this.fetchJson(url, {
      method: 'GET',
      headers: this.buildHeaders(probe.apiKey),
    });
    const ids = this.extractModelIds(response.body);

    if (!ids.length) {
      throw new HttpException(
        {
          success: false,
          error: '接口返回里没有解析到模型；请确认地址指向 OpenAI 兼容的 /v1 根路径',
        },
        400,
      );
    }

    return {
      success: true as const,
      data: { baseUrl: probe.baseUrl, models: ids },
    };
  }

  /** 发一条极小请求，确认模型真的能出话。 */
  async testChat(input: LlmProbeInput) {
    const probe = this.resolveProbe(input);
    const model =
      probe.model?.trim() ||
      getStoredRuntimeLlmConfig().model ||
      DEFAULT_RUNTIME_LLM_MODEL;
    const startedAt = Date.now();

    const response = await this.fetchJson(`${probe.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(probe.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '只回两个字：可用' }],
        max_tokens: 16,
        stream: false,
      }),
    });

    const latencyMs = Date.now() - startedAt;
    const body = response.body as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: Record<string, number>;
    };
    const sample = body?.choices?.[0]?.message?.content?.trim() ?? '';

    return {
      success: true as const,
      data: {
        baseUrl: probe.baseUrl,
        model,
        latencyMs,
        sample,
        usage: body?.usage ?? null,
      },
    };
  }

  private resolveProbe(input: LlmProbeInput): NormalizedProbe {
    const stored = getStoredRuntimeLlmConfig();
    const rawBaseUrl = input.baseUrl?.trim() || stored.baseUrl;
    const baseUrl = normalizeLlmBaseUrl(rawBaseUrl);
    if (!baseUrl) {
      throw new HttpException(
        { success: false, error: '请先填写接口地址，例如 172.20.0.2:7863' },
        400,
      );
    }
    // apiKey 传 undefined 表示沿用已保存的；传空串表示显式不鉴权
    const apiKey =
      input.apiKey === undefined ? stored.apiKey : input.apiKey.trim();

    return { baseUrl, apiKey, model: input.model };
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
  ): Promise<{ body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    (timer as unknown as { unref?: () => void }).unref?.();

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        throw new HttpException(
          {
            success: false,
            error: `接口返回 ${response.status}：${text.slice(0, 200)}`,
          },
          400,
        );
      }
      try {
        return { body: JSON.parse(text) };
      } catch {
        throw new HttpException(
          {
            success: false,
            error: `接口返回的不是 JSON：${text.slice(0, 120)}`,
          },
          400,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? `请求超时（${PROBE_TIMEOUT_MS / 1000}s），请检查地址与网络`
          : error instanceof Error
            ? error.message
            : '请求失败';
      throw new HttpException({ success: false, error: message }, 400);
    } finally {
      clearTimeout(timer);
    }
  }

  private extractModelIds(body: unknown): string[] {
    const record = body as Record<string, unknown> | null;
    const fromData = record?.data;
    const fromModels = record?.models;
    const raw: unknown[] = Array.isArray(fromData)
      ? fromData
      : Array.isArray(fromModels)
        ? fromModels
        : [];

    return raw
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const entry = item as Record<string, unknown>;
          const id = entry.id ?? entry.name ?? entry.model;
          return typeof id === 'string' ? id : null;
        }
        return null;
      })
      .filter((id): id is string => Boolean(id))
      .sort((a, b) => a.localeCompare(b));
  }

  private describeEffective(runtime: ReturnType<typeof getRuntimeLlmConfig>) {
    if (runtime) {
      return {
        source: 'local' as const,
        label: '本地 OpenAI 兼容接口',
        baseUrl: runtime.baseUrl,
        model: runtime.model,
      };
    }

    const env = getRuntimeEnvironment();
    const hasDeepSeek = Boolean(env.DEEPSEEK_API_KEY?.trim());
    const hasAlibaba = Boolean(env.ALIBABA_API_KEY?.trim());
    const spec = env.LLM_PROVIDER?.trim();

    if (!spec && !hasDeepSeek && !hasAlibaba) {
      return {
        source: 'none' as const,
        label: '未配置（AIGC 相关功能不可用）',
        baseUrl: '',
        model: '',
      };
    }

    const provider: LlmProviderId = spec?.includes('alibaba')
      ? 'alibaba'
      : spec?.includes('deepseek')
        ? 'deepseek'
        : hasAlibaba
          ? 'alibaba'
          : 'deepseek';
    const modelPart = spec?.split('/')[1]?.split(':')[0]?.trim();
    const model =
      modelPart && modelPart.length > 1 && modelPart !== provider
        ? modelPart
        : LLM_PROVIDER_DEFAULT_MODELS[provider];

    return {
      source: 'env' as const,
      label: `环境变量（${provider}）`,
      baseUrl: '',
      model,
    };
  }
}
