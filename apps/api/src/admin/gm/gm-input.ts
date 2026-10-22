// [daoyou-fork L1] fork-patch: gm-panel —— GM 后台输入协议
// 独立于上游 dev-tools 协议：这里只给管理员用，允许定向指定收款角色。
import { RewardSelectionsSchema } from '@daoyou/game-rules/rewards/materials';
import { z } from 'zod';

const reason = z.string().trim().min(1, '请填写操作原因').max(200);

const mailTitle = z.string().trim().min(1, '请填写邮件标题').max(200);
const mailContent = z.string().trim().min(1, '请填写邮件正文').max(10000);
const rewardSelections = RewardSelectionsSchema.min(1, '至少选择一项奖励');

const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) => !value || !Number.isNaN(new Date(value).getTime()),
    '时间格式错误',
  );

export const GmPlayerQuerySchema = z.object({
  q: z.string().trim().min(1, '请输入角色名或角色 ID').max(64),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GmDeliverSchema = z
  .object({
    requestId: z.uuid(),
    targetCultivatorIds: z
      .array(z.uuid())
      .min(1, '至少选择一个角色')
      .max(50, '单次最多 50 个角色'),
    mailTitle,
    mailContent,
    rewardSelections,
    reason,
  })
  .strict();

const batchTarget = z
  .object({
    cultivatorId: z.uuid(),
    userId: z.uuid(),
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export const GmBatchRedeemSchema = z
  .object({
    requestId: z.uuid(),
    /** public：一批公开码；bound：每个码绑定一个指定账号 */
    mode: z.enum(['public', 'bound']),
    count: z.number().int().min(1).max(200).optional(),
    targets: z.array(batchTarget).min(1).max(200).optional(),
    mailTitle,
    mailContent,
    rewardSelections,
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
    note: z.string().trim().max(200).optional(),
    reason,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'public' && !value.count) {
      ctx.addIssue({
        code: 'custom',
        path: ['count'],
        message: '公开码需要填写生成数量',
      });
    }
    if (value.mode === 'bound' && !value.targets?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['targets'],
        message: '定向码需要选择收款角色',
      });
    }
    if (value.startsAt && value.endsAt) {
      if (
        new Date(value.startsAt).getTime() > new Date(value.endsAt).getTime()
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['endsAt'],
          message: '结束时间不能早于生效时间',
        });
      }
    }
  });

export const GmBatchListQuerySchema = z.object({
  batchId: z.uuid(),
});

export const GmAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  targetCultivatorId: z.uuid().optional(),
});

export type GmDeliverInput = z.infer<typeof GmDeliverSchema>;
export type GmBatchRedeemInput = z.infer<typeof GmBatchRedeemSchema>;
