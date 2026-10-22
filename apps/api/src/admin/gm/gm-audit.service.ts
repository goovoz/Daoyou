// [daoyou-fork L1] fork-patch: gm-panel —— 审计查询
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@server/database/database.service.js';
import type { DbClient } from '@server/lib/drizzle/db.js';
import { gmAuditLogs } from '@server/lib/drizzle/schema.js';
import { desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { GmAuditQuerySchema } from './gm-input.js';

const PAGE_SIZE = 20;

@Injectable()
export class GmAuditService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly database: DbClient) {}

  async list(query: z.infer<typeof GmAuditQuerySchema>) {
    const rows = await this.database
      .select()
      .from(gmAuditLogs)
      .where(
        query.targetCultivatorId
          ? eq(gmAuditLogs.targetCultivatorId, query.targetCultivatorId)
          : undefined,
      )
      .orderBy(desc(gmAuditLogs.createdAt), desc(gmAuditLogs.id))
      .limit(PAGE_SIZE + 1)
      .offset((query.page - 1) * PAGE_SIZE);
    return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
  }
}
