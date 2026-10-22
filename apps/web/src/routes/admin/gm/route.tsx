// [daoyou-fork L1] fork-patch: gm-panel —— GM 定向发货
import { apiFetch } from '@app/lib/api/fetch';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkInput } from '@app/components/ui';
import { useState } from 'react';
import { AdminPageHeader } from '../_components/AdminPage';
import {
  RewardSelectionEditor,
  RewardSelectionPreview,
} from '../_components/RewardSelectionEditor';
import {
  parseRewardSelectionDrafts,
  type RewardSelectionDraft,
} from '../_components/RewardSelectionEditor.helpers';
import { PlayerPicker, type GmPlayerRow } from './_components/PlayerPicker';

type DeliveredRow = {
  cultivatorId: string;
  cultivatorName: string;
  mailId: string;
};

export default function AdminGmDeliverPage() {
  const { pushToast } = useInkUI();
  const [targets, setTargets] = useState<GmPlayerRow[]>([]);
  const [rewardSelections, setRewardSelections] = useState<
    RewardSelectionDraft[]
  >([]);
  const [mailTitle, setMailTitle] = useState('');
  const [mailContent, setMailContent] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [delivered, setDelivered] = useState<DeliveredRow[] | null>(null);

  const submit = async () => {
    if (loading) return;
    setError('');
    try {
      if (!targets.length) throw new Error('请先选择收件角色');
      if (!mailTitle.trim() || !mailContent.trim())
        throw new Error('请填写邮件标题与正文');
      if (!reason.trim()) throw new Error('请填写操作原因，便于事后审计');
      const parsed = parseRewardSelectionDrafts(rewardSelections);
      setLoading(true);
      const response = await apiFetch('/api/admin/gm/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          targetCultivatorIds: targets.map((target) => target.id),
          mailTitle: mailTitle.trim(),
          mailContent: mailContent.trim(),
          rewardSelections: parsed,
          reason: reason.trim(),
        }),
      });
      const data = (await response.json()) as {
        delivered?: DeliveredRow[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? '发货失败');
      setDelivered(data.delivered ?? []);
      pushToast({ message: '奖励已通过传音玉简送达', tone: 'success' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '发货失败');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setDelivered(null);
    setTargets([]);
    setRewardSelections([]);
    setMailTitle('');
    setMailContent('');
    setReason('');
    setError('');
  };

  if (delivered) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="发货完成"
          description="奖励已进入对方传音玉简，玩家领取后才会进入背包。"
        />
        <ul className="border-ink/10 divide-ink/10 divide-y border border-dashed text-sm">
          {delivered.map((row) => (
            <li
              key={row.mailId}
              className="flex flex-wrap justify-between gap-2 px-4 py-3"
            >
              <span className="font-semibold">{row.cultivatorName}</span>
              <span className="text-ink-secondary font-mono text-xs">
                邮件 {row.mailId.slice(0, 8)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <InkButton variant="primary" onClick={reset}>
            继续发货
          </InkButton>
          <InkButton href="/admin/audit">查看审计记录</InkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="定向发货"
        description="按角色直接投递传音玉简。适合补偿、客服处理与活动补发；道装每次都会生成独立实例。"
      />
      <fieldset disabled={loading} className="min-w-0 space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">一、选择收件角色</h3>
          <PlayerPicker selected={targets} onChange={setTargets} />
        </section>

        <section className="border-ink/10 space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">二、选择奖励</h3>
          <RewardSelectionEditor
            value={rewardSelections}
            onChange={setRewardSelections}
            disabled={loading}
          />
          {rewardSelections.length > 0 && (
            <div className="border-ink/10 border-t pt-3">
              <p className="text-ink-secondary mb-2 text-xs">奖励预览</p>
              <RewardSelectionPreview value={rewardSelections} />
            </div>
          )}
        </section>

        <section className="border-ink/10 space-y-4 border-t pt-5">
          <h3 className="text-sm font-semibold">三、邮件内容与原因</h3>
          <InkInput
            label="邮件标题"
            value={mailTitle}
            onChange={setMailTitle}
            placeholder="例如：客服补偿"
          />
          <InkInput
            label="邮件正文"
            value={mailContent}
            onChange={setMailContent}
            multiline
            rows={4}
          />
          <InkInput
            label="操作原因（必填，仅后台可见）"
            value={reason}
            onChange={setReason}
            placeholder="例如：战斗异常导致掉落丢失，按工单 #123 补偿"
            hint="会写入 GM 审计记录，事后可追溯。"
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
          确认发货（{targets.length} 人）
        </InkButton>
      </div>
    </div>
  );
}
