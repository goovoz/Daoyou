// [daoyou-fork L1] fork-patch: gm-panel —— GM 审计写入
import type { DbTransaction } from '@server/lib/drizzle/db.js';
import { gmAuditLogs } from '@server/lib/drizzle/schema.js';

export type GmAuditEntry = {
  actorUserId: string;
  actorEmail?: string | null;
  action: 'gm.deliver' | 'gm.redeem-codes.batch';
  requestId?: string | null;
  targetUserId?: string | null;
  targetCultivatorId?: string | null;
  targetCultivatorName?: string | null;
  reason: string;
  payload: unknown;
};

/** 必须在业务事务内调用，保证「发出去就一定留有审计」。 */
export async function writeGmAudit(tx: DbTransaction, entries: GmAuditEntry[]) {
  if (!entries.length) return;
  await tx.insert(gmAuditLogs).values(
    entries.map((entry) => ({
      actorUserId: entry.actorUserId,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      requestId: entry.requestId ?? null,
      targetUserId: entry.targetUserId ?? null,
      targetCultivatorId: entry.targetCultivatorId ?? null,
      targetCultivatorName: entry.targetCultivatorName ?? null,
      reason: entry.reason,
      payload: entry.payload as Record<string, unknown>,
    })),
  );
}
