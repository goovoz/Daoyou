// [daoyou-fork L1] fork-patch: gm-panel —— 角色检索与选择
import { apiFetch } from '@app/lib/api/fetch';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkInput } from '@app/components/ui';
import { useState } from 'react';

export type GmPlayerRow = {
  id: string;
  userId: string;
  name: string;
  realm: string;
  realmStage: string;
  status: string;
  spiritStones: number;
  reputation: number;
  lastActiveAt: string | null;
};

export async function searchGmPlayers(
  keyword: string,
): Promise<GmPlayerRow[]> {
  const response = await apiFetch(
    `/api/admin/gm/players?q=${encodeURIComponent(keyword)}`,
    { cache: 'no-store' },
  );
  const payload = (await response.json()) as {
    items?: GmPlayerRow[];
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? '查询角色失败');
  return payload.items ?? [];
}

export function PlayerPicker({
  selected,
  onChange,
  max = 50,
  disabled = false,
}: {
  selected: GmPlayerRow[];
  onChange: (value: GmPlayerRow[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const { pushToast } = useInkUI();
  const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState<GmPlayerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async () => {
    const q = keyword.trim();
    if (!q) return;
    setLoading(true);
    try {
      setRows(await searchGmPlayers(q));
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '查询角色失败',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggle = (row: GmPlayerRow) => {
    if (selected.some((item) => item.id === row.id)) {
      onChange(selected.filter((item) => item.id !== row.id));
      return;
    }
    if (selected.length >= max) {
      pushToast({ message: `最多选择 ${max} 个角色`, tone: 'warning' });
      return;
    }
    onChange([...selected, row]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <InkInput
            label="角色名 / 角色 ID / 账号 ID"
            value={keyword}
            onChange={setKeyword}
            placeholder="输入后点击查询"
            disabled={disabled || loading}
          />
        </div>
        <InkButton
          type="button"
          variant="secondary"
          pending={loading}
          disabled={disabled}
          onClick={() => void runSearch()}
        >
          查询
        </InkButton>
      </div>

      {rows.length > 0 && (
        <ul className="border-ink/10 divide-ink/10 divide-y border border-dashed">
          {rows.map((row) => {
            const active = selected.some((item) => item.id === row.id);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(row)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left text-sm ${
                    active ? 'bg-crimson/10' : 'hover:bg-ink/5'
                  }`}
                >
                  <span className="font-semibold">
                    {row.name}
                    <span className="text-ink-secondary ml-2 font-normal">
                      {row.realm}·{row.realmStage}
                    </span>
                  </span>
                  <span className="text-ink-secondary font-mono text-xs">
                    {row.status === 'active' ? '在世' : '已故'} · 灵石{' '}
                    {row.spiritStones} · 声望 {row.reputation} ·{' '}
                    {row.id.slice(0, 8)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="space-y-2">
          <p className="text-ink-secondary text-xs">
            已选 {selected.length} / {max} 个角色
          </p>
          <div className="flex flex-wrap gap-2">
            {selected.map((row) => (
              <button
                key={row.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(row)}
                className="border-ink/20 bg-bgpaper hover:bg-crimson/10 rounded-full border px-3 py-1 text-xs"
                title="点击移除"
              >
                {row.name} ✕
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
