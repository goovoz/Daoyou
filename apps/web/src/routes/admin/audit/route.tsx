// [daoyou-fork L1] fork-patch: gm-panel —— GM 审计记录
import { apiFetch } from '@app/lib/api/fetch';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui';
import { useCallback, useEffect, useState } from 'react';
import { AdminPageHeader } from '../_components/AdminPage';

type GmAuditRow = {
  id: string;
  actorUserId: string;
  actorEmail: string | null;
  action: string;
  targetCultivatorId: string | null;
  targetCultivatorName: string | null;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  'gm.deliver': '定向发货',
  'gm.redeem-codes.batch': '批量发码',
};

export default function AdminAuditPage() {
  const { pushToast } = useInkUI();
  const [rows, setRows] = useState<GmAuditRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (target: number) => {
      setLoading(true);
      try {
        const response = await apiFetch(`/api/admin/gm/audit?page=${target}`, {
          cache: 'no-store',
        });
        const data = (await response.json()) as {
          items?: GmAuditRow[];
          hasMore?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? '加载审计失败');
        setRows(data.items ?? []);
        setHasMore(Boolean(data.hasMore));
        setPage(target);
      } catch (error) {
        pushToast({
          message: error instanceof Error ? error.message : '加载审计失败',
          tone: 'danger',
        });
      } finally {
        setLoading(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="GM 审计"
        description="记录所有定向发货与批量发码操作，包含操作人、原因与时间。"
        actions={
          <InkButton disabled={loading} onClick={() => void load(page)}>
            刷新
          </InkButton>
        }
      />

      {!rows.length && !loading && (
        <p className="text-ink-secondary text-sm">暂无记录。</p>
      )}

      <ul className="border-ink/10 divide-ink/10 divide-y border border-dashed">
        {rows.map((row) => (
          <li key={row.id} className="space-y-2 px-4 py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {ACTION_LABELS[row.action] ?? row.action}
                {row.targetCultivatorName
                  ? ` · ${row.targetCultivatorName}`
                  : ''}
              </span>
              <span className="text-ink-secondary font-mono text-xs">
                {new Date(row.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-ink-secondary break-words">
              原因：{row.reason}
            </p>
            <p className="text-ink-secondary font-mono text-xs break-all">
              操作人 {row.actorEmail ?? row.actorUserId}
              {row.targetCultivatorId
                ? ` · 角色 ${row.targetCultivatorId.slice(0, 8)}`
                : ''}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3">
        <InkButton
          disabled={loading || page <= 1}
          onClick={() => void load(page - 1)}
        >
          上一页
        </InkButton>
        <span className="text-ink-secondary font-mono text-xs">第 {page} 页</span>
        <InkButton
          disabled={loading || !hasMore}
          onClick={() => void load(page + 1)}
        >
          下一页
        </InkButton>
      </div>
    </div>
  );
}
