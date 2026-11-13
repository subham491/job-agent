import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai/ai.service.js';
import { ApplyController } from './apply/apply.controller.js';
import { ApplyService } from './apply/apply.service.js';
import { validateEnv } from './config/env.js';
import { NaukriConnector } from './connectors/naukri/naukri.connector.js';
import { HealthController } from './health/health.controller.js';
import { JobsController } from './jobs/jobs.controller.js';
import { JobsService } from './jobs/jobs.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfileController } from './profile/profile.controller.js';
import { ProfileService } from './profile/profile.service.js';
import { VaultModule } from './vault/vault.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    VaultModule,
  ],
  controllers: [
    HealthController,
    JobsController,
    ProfileController,
    ApplyController,
  ],
  providers: [
    NaukriConnector,
    JobsService,
    ProfileService,
    AiService,
    ApplyService,
  ],
})
export class AppModule {}
