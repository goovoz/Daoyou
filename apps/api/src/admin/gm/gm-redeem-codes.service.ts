// [daoyou-fork L1] fork-patch: gm-panel —— 批量生成兑换码（公开码 / 定向码）
import type { AuthUser } from '@server/lib/auth/types.js';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@server/database/database.service.js';
import type { DbClient } from '@server/lib/drizzle/db.js';
import { gmAuditLogs, redeemCodes } from '@server/lib/drizzle/schema.js';
import { generateRedeemCode } from '@server/lib/redeem/code.js';
import { rewardAttachments } from '@daoyou/game-rules/rewards/materials';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { writeGmAudit } from './gm-audit.js';
import type { GmBatchRedeemInput } from './gm-input.js';
import { GmPlayersService } from './gm-players.service.js';

/** 定向码与公开码统一使用 16 位，降低被猜中的可能。 */
const GM_CODE_LENGTH = 16;
const CODE_INSERT_RETRIES = 6;

@Injectable()
export class GmRedeemCodesService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly database: DbClient,
    @Inject(GmPlayersService) private readonly players: GmPlayersService,
  ) {}

  async createBatch(actor: AuthUser, input: GmBatchRedeemInput) {
    const attachments = rewardAttachments(input.rewardSelections);
    const batchId = randomUUID();
    const targets =
      input.mode === 'bound'
        ? await this.players.requireDeliverable(
            (input.targets ?? []).map((target) => target.cultivatorId),
          )
        : [];
    const limited = await this.database
      .select({ id: gmAuditLogs.id })
      .from(gmAuditLogs)
      .where(eq(gmAuditLogs.requestId, input.requestId))
      .limit(1);
    if (limited.length) {
      throw new HttpException(
        { error: '该请求已处理，请勿重复提交', duplicate: true },
        409,
      );
    }

    const slots =
      input.mode === 'bound'
        ? targets.map((target) => ({
            boundUserId: target.userId as string | null,
            boundCultivatorId: target.id as string | null,
            boundName: target.name,
          }))
        : Array.from({ length: input.count ?? 0 }, () => ({
            boundUserId: null as string | null,
            boundCultivatorId: null as string | null,
            boundName: null,
          }));
    if (!slots.length) {
      throw new HttpException({ error: '没有需要生成的兑换码' }, 400);
    }

    const result = await this.database.transaction(async (tx) => {
      const created: {
        id: string;
        code: string;
        boundCultivatorName: string | null;
      }[] = [];
      for (const slot of slots) {
        let inserted = null as { id: string; code: string } | null;
        for (let attempt = 0; attempt < CODE_INSERT_RETRIES; attempt += 1) {
          const [row] = await tx
            .insert(redeemCodes)
            .values({
              code: generateRedeemCode(GM_CODE_LENGTH),
              rewardPresetId: '__inventory_v1_snapshot__',
              rewardAttachments: attachments,
              mailTitle: input.mailTitle,
              mailContent: input.mailContent,
              totalLimit: 1,
              startsAt: input.startsAt ? new Date(input.startsAt) : null,
              endsAt: input.endsAt ? new Date(input.endsAt) : null,
              status: 'active',
              boundUserId: slot.boundUserId,
              boundCultivatorId: slot.boundCultivatorId,
              batchId,
              note: input.note ?? null,
              createdBy: actor.id,
              updatedBy: actor.id,
            })
            .onConflictDoNothing({ target: redeemCodes.code })
            .returning({ id: redeemCodes.id, code: redeemCodes.code });
          if (row) {
            inserted = row;
            break;
          }
        }
        if (!inserted) {
          throw new HttpException(
            { error: '兑换码生成冲突过多，请重试' },
            500,
          );
        }
        created.push({ ...inserted, boundCultivatorName: slot.boundName });
      }

      await writeGmAudit(
        tx,
        created.map((item, index) => ({
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: 'gm.redeem-codes.batch' as const,
          requestId: index === 0 ? input.requestId : null,
          targetUserId: slots[index].boundUserId,
          targetCultivatorId: slots[index].boundCultivatorId,
          targetCultivatorName: slots[index].boundName,
          reason: input.reason,
          payload: {
            batchId,
            mode: input.mode,
            codeId: item.id,
            note: input.note ?? null,
            rewardSelections: input.rewardSelections,
          },
        })),
      );

      return { success: true, batchId, mode: input.mode, codes: created };
    });
    return result;
  }

  async listBatch(batchId: string) {
    const rows = await this.database
      .select({
        id: redeemCodes.id,
        code: redeemCodes.code,
        status: redeemCodes.status,
        boundCultivatorId: redeemCodes.boundCultivatorId,
        claimedCount: redeemCodes.claimedCount,
        note: redeemCodes.note,
        createdAt: redeemCodes.createdAt,
      })
      .from(redeemCodes)
      .where(eq(redeemCodes.batchId, batchId))
      .orderBy(desc(redeemCodes.createdAt));
    return { items: rows };
  }

  /** 停用整批尚未被领取的码。 */
  async disableBatch(actor: AuthUser, batchId: string) {
    const rows = await this.database
      .update(redeemCodes)
      .set({ status: 'disabled', updatedBy: actor.id })
      .where(
        and(
          eq(redeemCodes.batchId, batchId),
          eq(redeemCodes.status, 'active'),
          eq(redeemCodes.claimedCount, 0),
        ),
      )
      .returning({ id: redeemCodes.id });
    return { success: true, disabled: rows.length };
  }
}
