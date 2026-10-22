// [daoyou-fork L1] fork-patch: gm-panel —— 定向发货（系统邮件通道）
import type { AuthUser } from '@server/lib/auth/types.js';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@server/database/database.service.js';
import type { DbClient } from '@server/lib/drizzle/db.js';
import { gmAuditLogs } from '@server/lib/drizzle/schema.js';
import {
  materializeRewardAttachments,
  rewardAttachments,
} from '@daoyou/game-rules/rewards/materials';
import { MailService } from '@server/mail/application/MailService.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { writeGmAudit } from './gm-audit.js';
import type { GmDeliverInput } from './gm-input.js';
import { GmPlayersService } from './gm-players.service.js';

@Injectable()
export class GmDeliveryService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly database: DbClient,
    @Inject(GmPlayersService) private readonly players: GmPlayersService,
  ) {}

  async deliver(actor: AuthUser, input: GmDeliverInput) {
    const targets = await this.players.requireDeliverable(
      input.targetCultivatorIds,
    );
    const attachments = rewardAttachments(input.rewardSelections);

    return this.database.transaction(async (tx) => {
      const existing = await tx
        .select({ id: gmAuditLogs.id })
        .from(gmAuditLogs)
        .where(eq(gmAuditLogs.requestId, input.requestId))
        .limit(1);
      if (existing.length) {
        throw new HttpException(
          { error: '该请求已处理，请勿重复提交', duplicate: true },
          409,
        );
      }
      const delivered: {
        cultivatorId: string;
        cultivatorName: string;
        mailId: string;
      }[] = [];
      for (const target of targets) {
        // 每件道装都必须拿到独立实例 ID，因此逐个收件人物化一次附件快照。
        const mail = await MailService.sendMail(
          target.id,
          input.mailTitle,
          input.mailContent,
          materializeRewardAttachments(attachments, randomUUID),
          'reward',
          tx,
        );
        delivered.push({
          cultivatorId: target.id,
          cultivatorName: target.name,
          mailId: mail.id,
        });
      }
      await writeGmAudit(
        tx,
        delivered.map((item) => ({
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: 'gm.deliver' as const,
          requestId: input.requestId,
          targetUserId: targets.find((t) => t.id === item.cultivatorId)?.userId,
          targetCultivatorId: item.cultivatorId,
          targetCultivatorName: item.cultivatorName,
          reason: input.reason,
          payload: {
            mailTitle: input.mailTitle,
            mailId: item.mailId,
            rewardSelections: input.rewardSelections,
          },
        })),
      );
      return { success: true, delivered };
    });
  }
}
