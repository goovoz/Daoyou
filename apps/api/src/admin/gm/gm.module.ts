// [daoyou-fork L1] fork-patch: gm-panel
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@server/database/database.module.js';
import { GmAuditService } from './gm-audit.service.js';
import { GmDeliveryService } from './gm-delivery.service.js';
import { GmController } from './gm.controller.js';
import { GmPlayersService } from './gm-players.service.js';
import { GmRedeemCodesService } from './gm-redeem-codes.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [GmController],
  providers: [
    GmPlayersService,
    GmDeliveryService,
    GmRedeemCodesService,
    GmAuditService,
  ],
})
export class GmModule {}
