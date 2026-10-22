// [daoyou-fork L1] fork-patch: gm-panel —— 角色检索
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@server/database/database.service.js';
import type { DbClient } from '@server/lib/drizzle/db.js';
import { cultivators } from '@server/lib/drizzle/schema.js';
import { desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { GmPlayerQuerySchema } from './gm-input.js';

@Injectable()
export class GmPlayersService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly database: DbClient) {}

  async search(query: z.infer<typeof GmPlayerQuerySchema>) {
    const keyword = query.q.trim().toLowerCase();
    const rows = await this.database
      .select({
        id: cultivators.id,
        userId: cultivators.userId,
        name: cultivators.name,
        realm: cultivators.realm,
        realmStage: cultivators.realm_stage,
        status: cultivators.status,
        spiritStones: cultivators.spirit_stones,
        reputation: cultivators.reputation,
        lastActiveAt: cultivators.lastActiveAt,
      })
      .from(cultivators)
      .where(
        or(
          ilike(cultivators.name, `%${keyword}%`),
          sql`${cultivators.id}::text = ${keyword}`,
          sql`${cultivators.userId}::text = ${keyword}`,
        ),
      )
      .orderBy(desc(cultivators.lastActiveAt), desc(cultivators.id))
      .limit(query.limit);
    return { items: rows };
  }

  /** 校验角色存在且可发放，返回用于审计的角色快照。 */
  async requireDeliverable(cultivatorIds: string[]) {
    const rows = await this.database
      .select({
        id: cultivators.id,
        userId: cultivators.userId,
        name: cultivators.name,
        status: cultivators.status,
      })
      .from(cultivators)
      .where(inArray(cultivators.id, cultivatorIds));
    const missing = cultivatorIds.filter(
      (id) => !rows.some((row) => row.id === id),
    );
    if (missing.length) {
      throw new HttpException(
        { error: `角色不存在：${missing.join('、')}` },
        404,
      );
    }
    const inactive = rows.filter((row) => row.status !== 'active');
    if (inactive.length) {
      throw new HttpException(
        {
          error: `角色当前不可发放：${inactive.map((row) => row.name).join('、')}`,
        },
        409,
      );
    }
    return rows;
  }

  async findOne(cultivatorId: string) {
    const [row] = await this.database
      .select({
        id: cultivators.id,
        userId: cultivators.userId,
        name: cultivators.name,
        status: cultivators.status,
      })
      .from(cultivators)
      .where(eq(cultivators.id, cultivatorId));
    return row ?? null;
  }
}
