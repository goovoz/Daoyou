// [daoyou-fork L1] fork-patch: local-llm —— 后台模型配置
import { apiFetch } from '@app/lib/api/fetch';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkInput, InkNotice, InkSelect } from '@app/components/ui';
import { useCallback, useEffect, useState } from 'react';
import { AdminPageHeader } from '../_components/AdminPage';

type EffectiveConfig = {
  source: 'local' | 'env' | 'none';
  label: string;
  baseUrl: string;
  model: string;
};

type StoredConfig = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
};

type ConfigPayload = {
  stored: StoredConfig;
  effective: EffectiveConfig;
  defaultModel: string;
};

const SOURCE_TONE: Record<EffectiveConfig['source'], string> = {
  local: 'text-tier-shen',
  env: 'text-ink',
  none: 'text-ink/60',
};

export default function AdminLlmConfigPage() {
  const { pushToast } = useInkUI();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'models' | 'test' | 'save'>('');
  const [error, setError] = useState('');

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [enabled, setEnabled] = useState(false);

  const [models, setModels] = useState<string[]>([]);
  const [effective, setEffective] = useState<EffectiveConfig | null>(null);
  const [stored, setStored] = useState<StoredConfig | null>(null);
  const [testResult, setTestResult] = useState<string>('');

  const applyPayload = useCallback((data: ConfigPayload) => {
    setStored(data.stored);
    setEffective(data.effective);
    setBaseUrl(data.stored.baseUrl);
    setModel(data.stored.model || data.defaultModel);
    setEnabled(data.stored.enabled);
    setApiKey('');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/admin/llm/config', {
        cache: 'no-store',
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          typeof json.error === 'string' ? json.error : '读取模型配置失败',
        );
      }
      const payload = json.data as ConfigPayload | undefined;
      if (!payload) throw new Error('读取模型配置失败');
      applyPayload(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取模型配置失败');
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const probeBody = () =>
    JSON.stringify({
      baseUrl: baseUrl.trim(),
      // 未填写的密钥不覆盖已保存值；显式清空才会发空串
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    });

  const fetchModels = async () => {
    if (busy) return;
    setBusy('models');
    setError('');
    setTestResult('');
    try {
      const response = await apiFetch('/api/admin/llm/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: probeBody(),
      });
      const data = (await response.json()) as {
        data?: { models: string[] };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? '读取模型列表失败');
      const list = data.data?.models ?? [];
      setModels(list);
      if (list.length && !model) setModel(list[0]);
      pushToast({
        message: `读取到 ${list.length} 个模型`,
        tone: 'success',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取模型列表失败');
    } finally {
      setBusy('');
    }
  };

  const runTest = async () => {
    if (busy) return;
    setBusy('test');
    setError('');
    setTestResult('');
    try {
      const response = await apiFetch('/api/admin/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...JSON.parse(probeBody()),
          model: model.trim(),
        }),
      });
      const data = (await response.json()) as {
        data?: { latencyMs: number; sample: string; model: string };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? '连通性测试失败');
      const result = data.data;
      setTestResult(
        `可用 · ${result?.model} · ${result?.latencyMs}ms · 回话「${result?.sample || '（空）'}」`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '连通性测试失败');
    } finally {
      setBusy('');
    }
  };

  const save = async (nextEnabled: boolean) => {
    if (busy) return;
    setBusy('save');
    setError('');
    try {
      const response = await apiFetch('/api/admin/llm/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: nextEnabled,
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
        }),
      });
      const data = (await response.json()) as {
        data?: ConfigPayload;
        error?: string;
      };
      if (!response.ok || !data.data) {
        throw new Error(data.error ?? '保存失败');
      }
      setStored(data.data.stored);
      setEffective(data.data.effective);
      setEnabled(data.data.stored.enabled);
      setApiKey('');
      pushToast({
        message: nextEnabled ? '已启用本地模型接口' : '已停用，回落到环境变量',
        tone: 'success',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="模型配置"
        description="把 AIGC 调用指向本地部署的 OpenAI 兼容接口（默认端口 7863）。接口密钥可留空表示不鉴权。"
      />

      {error ? <InkNotice tone="danger">{error}</InkNotice> : null}
      {testResult ? <InkNotice tone="info">{testResult}</InkNotice> : null}

      <section className="border-ink/15 space-y-4 rounded-lg border p-4">
        <div className="text-ink/70 text-sm">
          当前生效：
          <span className={`ml-1 font-medium ${SOURCE_TONE[effective?.source ?? 'none']}`}>
            {loading ? '读取中……' : (effective?.label ?? '未知')}
          </span>
          {effective?.model ? (
            <span className="text-ink/60 ml-2">模型 {effective.model}</span>
          ) : null}
          {effective?.baseUrl ? (
            <span className="text-ink/50 ml-2">（{effective.baseUrl}）</span>
          ) : null}
        </div>

        <InkInput
          label="接口地址"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="172.20.0.2:7863（可省略 http://，会自动补 /v1）"
        />
        <InkInput
          label="API 密钥（留空＝不鉴权）"
          value={apiKey}
          onChange={setApiKey}
          placeholder={
            stored?.hasApiKey
              ? `已保存 ${stored.apiKeyMasked}，留空则不修改`
              : '本地接口不鉴权时可留空'
          }
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            {models.length ? (
              <InkSelect label="模型" value={model} onChange={setModel}>
                {models.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </InkSelect>
            ) : (
              <InkInput
                label="模型"
                value={model}
                onChange={setModel}
                placeholder="deepseek-v4.1-flash"
              />
            )}
          </div>
          <InkButton
            variant="secondary"
            onClick={() => void fetchModels()}
            pending={busy === 'models'}
            pendingLabel="读取中……"
          >
            读取模型
          </InkButton>
          <InkButton
            variant="secondary"
            onClick={() => void runTest()}
            pending={busy === 'test'}
            pendingLabel="测试中……"
          >
            测试连通
          </InkButton>
        </div>

        {models.length ? (
          <p className="text-ink/50 text-xs">
            已读取 {models.length} 个模型；如需其他模型可在下拉里选择。
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <InkButton
            variant="primary"
            onClick={() => void save(true)}
            pending={busy === 'save'}
            pendingLabel="保存中……"
          >
            保存并启用
          </InkButton>
          <InkButton
            variant="secondary"
            onClick={() => void save(false)}
            pending={busy === 'save'}
            pendingLabel="保存中……"
          >
            停用（回落环境变量）
          </InkButton>
          <span className="text-ink/50 text-xs">
            保存后立即生效，无需重启；服务重启后从数据库恢复。
          </span>
        </div>
      </section>

      <section className="text-ink/60 space-y-1 text-xs">
        <p>接口要求：OpenAI 形态，需提供 GET /v1/models 与 POST /v1/chat/completions。</p>
        <p>
          地址填到 7863 即可，系统会自动补成 http://…:7863/v1；密钥为空时不发送
          Authorization 头。
        </p>
      </section>
    </div>
  );
}
