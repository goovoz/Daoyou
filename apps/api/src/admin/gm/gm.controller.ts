// [daoyou-fork L1] fork-patch: gm-panel —— GM 后台接口
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import type { AuthUser } from '@server/lib/auth/types.js';
import type { z } from 'zod';
import { Access, CurrentUser } from '../../auth/access.js';
import { AdminErrors } from '../admin-errors.js';
import { FirstQuery } from '../../http/first-query.js';
import { JsonBody } from '../../http/json-body.js';
import { ZodPipe } from '../../http/zod.pipe.js';
import { GmAuditService } from './gm-audit.service.js';
import { GmDeliveryService } from './gm-delivery.service.js';
import {
  GmAuditQuerySchema,
  GmBatchListQuerySchema,
  GmBatchRedeemSchema,
  GmDeliverSchema,
  GmPlayerQuerySchema,
} from './gm-input.js';
import { GmPlayersService } from './gm-players.service.js';
import { GmRedeemCodesService } from './gm-redeem-codes.service.js';

@Controller('api/admin/gm')
@Access('admin')
@UseFilters(AdminErrors)
export class GmController {
  constructor(
    @Inject(GmPlayersService) private readonly players: GmPlayersService,
    @Inject(GmDeliveryService) private readonly delivery: GmDeliveryService,
    @Inject(GmRedeemCodesService)
    private readonly redeemCodes: GmRedeemCodesService,
    @Inject(GmAuditService) private readonly audit: GmAuditService,
  ) {}

  @Get('players')
  search(
    @FirstQuery(new ZodPipe(GmPlayerQuerySchema, 'legacy-unhandled'))
    query: z.infer<typeof GmPlayerQuerySchema>,
  ) {
    return this.players.search(query);
  }

  @Post('deliver')
  @HttpCode(200)
  deliver(
    @CurrentUser() user: AuthUser,
    @JsonBody(
      { fallback: undefined },
      new ZodPipe(GmDeliverSchema, 'legacy-unhandled'),
    )
    input: z.infer<typeof GmDeliverSchema>,
  ) {
    return this.delivery.deliver(user, input);
  }

  @Post('redeem-codes/batch')
  @HttpCode(200)
  createBatch(
    @CurrentUser() user: AuthUser,
    @JsonBody(
      { fallback: undefined },
      new ZodPipe(GmBatchRedeemSchema, 'legacy-unhandled'),
    )
    input: z.infer<typeof GmBatchRedeemSchema>,
  ) {
    return this.redeemCodes.createBatch(user, input);
  }

  @Get('redeem-codes')
  listBatch(
    @FirstQuery(new ZodPipe(GmBatchListQuerySchema, 'legacy-unhandled'))
    query: z.infer<typeof GmBatchListQuerySchema>,
  ) {
    return this.redeemCodes.listBatch(query.batchId);
  }

  @Post('redeem-codes/:batchId/disable')
  @HttpCode(200)
  disableBatch(
    @CurrentUser() user: AuthUser,
    @Param('batchId') batchId: string,
  ) {
    return this.redeemCodes.disableBatch(user, batchId);
  }

  @Get('audit')
  listAudit(
    @FirstQuery(new ZodPipe(GmAuditQuerySchema, 'legacy-unhandled'))
    query: z.infer<typeof GmAuditQuerySchema>,
  ) {
    return this.audit.list(query);
  }
}
