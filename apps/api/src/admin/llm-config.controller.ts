// [daoyou-fork L1] fork-patch: local-llm —— 后台模型配置接口
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  UseFilters,
} from '@nestjs/common';
import type { AuthUser } from '@server/lib/auth/types.js';
import type { z } from 'zod';
import { Access, CurrentUser } from '../auth/access.js';
import { AdminErrors } from './admin-errors.js';
import { JsonBody } from '../http/json-body.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { AdminLlmConfigService } from './llm-config.service.js';
import { LlmProbeSchema, SaveLlmConfigSchema } from './llm-config-input.js';

@Controller('api/admin/llm')
@Access('admin')
@UseFilters(AdminErrors)
export class AdminLlmConfigController {
  constructor(
    @Inject(AdminLlmConfigService)
    private readonly service: AdminLlmConfigService,
  ) {}

  @Get('config')
  getConfig() {
    return this.service.getConfig();
  }

  @Put('config')
  @HttpCode(200)
  saveConfig(
    @CurrentUser() user: AuthUser,
    @JsonBody(
      { fallback: undefined },
      new ZodPipe(SaveLlmConfigSchema, 'legacy-unhandled'),
    )
    input: z.infer<typeof SaveLlmConfigSchema>,
  ) {
    return this.service.saveConfig(user, input);
  }

  @Post('models')
  @HttpCode(200)
  listModels(
    @JsonBody(
      { fallback: {} },
      new ZodPipe(LlmProbeSchema, 'legacy-unhandled'),
    )
    input: z.infer<typeof LlmProbeSchema>,
  ) {
    return this.service.listModels(input);
  }

  @Post('test')
  @HttpCode(200)
  testChat(
    @JsonBody(
      { fallback: {} },
      new ZodPipe(LlmProbeSchema, 'legacy-unhandled'),
    )
    input: z.infer<typeof LlmProbeSchema>,
  ) {
    return this.service.testChat(input);
  }
}
