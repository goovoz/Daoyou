import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UseFilters,
} from '@nestjs/common';
import { AdminItemGenerationSchema } from '@daoyou/contracts/admin/item-generation';
import type { z } from 'zod';
import { Access } from '../auth/access.js';
import { FirstQuery } from '../http/first-query.js';
import { JsonBody } from '../http/json-body.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { AdminErrors } from './admin-errors.js';
import { AdminRewardItemsService } from './reward-items.service.js';

@Controller('api/admin/reward-items')
@Access('admin')
@UseFilters(AdminErrors)
export class AdminRewardItemsController {
  constructor(
    @Inject(AdminRewardItemsService)
    private readonly rewards: AdminRewardItemsService,
  ) {}

  /** [daoyou-fork L1] fork-patch: gm-panel —— 道装可指定属性的选项目录 */
  @Get('equipment-options')
  equipmentOptions(@FirstQuery('templateId') templateId?: string) {
    return { success: true, data: this.rewards.equipmentOptions(templateId) };
  }

  @Post('generate')
  @HttpCode(200)
  generate(
    @JsonBody(
      { fallback: undefined },
      new ZodPipe(AdminItemGenerationSchema, 'legacy-unhandled'),
    )
    input: z.infer<typeof AdminItemGenerationSchema>,
  ) {
    return this.rewards.generate(input);
  }
}
