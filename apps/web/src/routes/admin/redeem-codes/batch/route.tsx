// [daoyou-fork L1] fork-patch: gm-panel —— 批量生成兑换码
import { apiFetch } from '@app/lib/api/fetch';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkInput } from '@app/components/ui';
import { useState } from 'react';
import { AdminPageHeader } from '../../_components/AdminPage';
import {
  RewardSelectionEditor,
  RewardSelectionPreview,
} from '../../_components/RewardSelectionEditor';
import {
  parseRewardSelectionDrafts,
  type RewardSelectionDraft,
} from '../../_components/RewardSelectionEditor.helpers';
import { PlayerPicker, type GmPlayerRow } from '../../gm/_components/PlayerPicker';

type CreatedCode = {
  id: string;
  code: string;
  boundCultivatorName: string | null;
};

type BatchResult = {
  batchId: string;
  mode: 'public' | 'bound';
  codes: CreatedCode[];
};

function toCsv(codes: CreatedCode[]): string {
  const header = '兑换码,绑定角色';
  const lines = codes.map(
    (row) => `${row.code},${row.boundCultivatorName ?? ''}`,
  );
  return [header, ...lines].join('\r\n');
}

export default function AdminRedeemCodeBatchPage() {
  const { pushToast } = useInkUI();
  const [mode, setMode] = useState<'public' | 'bound'>('public');
  const [count, setCount] = useState('10');
  const [targets, setTargets] = useState<GmPlayerRow[]>([]);
  const [rewardSelections, setRewardSelections] = useState<
    RewardSelectionDraft[]
  >([]);
  const [mailTitle, setMailTitle] = useState('');
  const [mailContent, setMailContent] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BatchResult | null>(null);

  const submit = async () => {
    if (loading) return;
    setError('');
    try {
      if (!mailTitle.trim() || !mailContent.trim())
        throw new Error('请填写邮件标题与正文');
      if (!reason.trim()) throw new Error('请填写操作原因，便于事后审计');
      const parsed = parseRewardSelectionDrafts(rewardSelections);
      if (mode === 'public') {
        const size = Number(count);
        if (!Number.isInteger(size) || size < 1 || size > 200)
          throw new Error('生成数量必须为 1 至 200 的整数');
      } else if (!targets.length) {
        throw new Error('定向码需要先选择收款角色');
      }
      setLoading(true);
      const response = await apiFetch('/api/admin/gm/redeem-codes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          mode,
          count: mode === 'public' ? Number(count) : undefined,
          targets:
            mode === 'bound'
              ? targets.map((target) => ({
                  cultivatorId: target.id,
                  userId: target.userId,
                  name: target.name,
                }))
              : undefined,
          mailTitle: mailTitle.trim(),
          mailContent: mailContent.trim(),
          rewardSelections: parsed,
          startsAt: startsAt || undefined,
          endsAt: endsAt || undefined,
          note: note.trim() || undefined,
          reason: reason.trim(),
        }),
      });
      const data = (await response.json()) as BatchResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? '生成兑换码失败');
      setResult(data);
      pushToast({ message: `已生成 ${data.codes.length} 个兑换码`, tone: 'success' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成兑换码失败');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="兑换码已生成"
          description={`批次 ${result.batchId.slice(0, 8)} · 共 ${result.codes.length} 个，每个码仅可被领取一次。`}
        />
        <div className="flex flex-wrap gap-3">
          <InkButton
            variant="primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  result.codes.map((row) => row.code).join('\n'),
                );
                pushToast({ message: '已复制全部兑换码', tone: 'success' });
              } catch {
                pushToast({ message: '复制失败，请手动选择', tone: 'warning' });
              }
            }}
          >
            复制全部
          </InkButton>
          <InkButton
            onClick={() => {
              const blob = new Blob([`\uFEFF${toCsv(result.codes)}`], {
                type: 'text/csv;charset=utf-8',
              });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = `兑换码-${result.batchId.slice(0, 8)}.csv`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            下载 CSV
          </InkButton>
          <InkButton
            onClick={() => {
              setResult(null);
              setTargets([]);
              setRewardSelections([]);
            }}
          >
            继续生成
          </InkButton>
        </div>
        <ul className="border-ink/10 divide-ink/10 divide-y border border-dashed font-mono text-sm">
          {result.codes.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
            >
              <span className="tracking-wider">{row.code}</span>
              <span className="text-ink-secondary text-xs">
                {row.boundCultivatorName ?? '公开码'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="批量生成兑换码"
        description="每个兑换码只能被领取一次，奖励经传音玉简发放。定向码会跳过公开兑换的境界门槛。"
      />

      <fieldset disabled={loading} className="min-w-0 space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">一、发码方式</h3>
          <div className="flex flex-wrap gap-3">
            <InkButton
              variant={mode === 'public' ? 'primary' : 'secondary'}
              onClick={() => setMode('public')}
            >
              公开码（谁先领谁得）
            </InkButton>
            <InkButton
              variant={mode === 'bound' ? 'primary' : 'secondary'}
              onClick={() => setMode('bound')}
            >
              定向码（绑定指定角色）
            </InkButton>
          </div>
          {mode === 'public' ? (
            <InkInput
              label="生成数量"
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={setCount}
              hint="1 至 200 个。每个码限领一次。"
            />
          ) : (
            <PlayerPicker
              selected={targets}
              onChange={setTargets}
              max={200}
            />
          )}
        </section>

        <section className="border-ink/10 space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">二、奖励内容</h3>
          <RewardSelectionEditor
            value={rewardSelections}
            onChange={setRewardSelections}
            disabled={loading}
          />
          {rewardSelections.length > 0 && (
            <div className="border-ink/10 border-t pt-3">
              <p className="text-ink-secondary mb-2 text-xs">每个码可领到的奖励</p>
              <RewardSelectionPreview value={rewardSelections} />
            </div>
          )}
        </section>

        <section className="border-ink/10 space-y-4 border-t pt-5">
          <h3 className="text-sm font-semibold">三、邮件与有效期</h3>
          <InkInput
            label="邮件标题"
            value={mailTitle}
            onChange={setMailTitle}
            placeholder="例如：活动兑换奖励"
          />
          <InkInput
            label="邮件正文"
            value={mailContent}
            onChange={setMailContent}
            multiline
            rows={3}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <InkInput
              label="生效时间"
              type="datetime-local"
              value={startsAt}
              onChange={setStartsAt}
              hint="留空立即生效"
            />
            <InkInput
              label="结束时间"
              type="datetime-local"
              value={endsAt}
              onChange={setEndsAt}
              hint="留空长期有效"
            />
          </div>
          <InkInput
            label="批次备注"
            value={note}
            onChange={setNote}
            placeholder="例如：双十一活动第二批"
          />
          <InkInput
            label="操作原因（必填，仅后台可见）"
            value={reason}
            onChange={setReason}
            hint="会写入 GM 审计记录。"
          />
        </section>
      </fieldset>

      {error && (
        <p role="alert" className="text-crimson text-sm">
          {error}
        </p>
      )}

      <div className="border-ink/15 flex justify-end border-t pt-4">
        <InkButton
          variant="primary"
          pending={loading}
          onClick={() => void submit()}
        >
          {mode === 'public'
            ? `生成 ${count || 0} 个公开码`
            : `为 ${targets.length} 个角色生成定向码`}
        </InkButton>
      </div>
    </div>
  );
}
