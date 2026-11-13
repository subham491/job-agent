import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import type { Answer, Application } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApplyService } from './apply.service.js';

const applySchema = z.object({
  jobId: z.string().uuid(),
  /** Set to apply to a second job at a company already applied to today. */
  anyCompany: z.boolean().default(false),
});
const shortlistSchema = z.object({ jobId: z.string().uuid(), on: z.boolean() });
const topSchema = z.object({ limit: z.number().int().min(1).max(10).default(5) });
const answerSchema = z.object({ answer: z.string().trim().min(1).max(2000) });
const settingsSchema = z.object({ angelMode: z.boolean() });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
}

@Controller()
export class ApplyController {
  constructor(
    private readonly apply: ApplyService,
    private readonly prisma: PrismaService,
  ) {}

  /** The Board: every shortlisted or approved job and where it stands. */
  @Get('applications')
  list(): Promise<unknown[]> {
    return this.apply.list();
  }

  /** Apply to one job. Calling this is the approval; the application is sent in the background. */
  @Post('applications')
  request(@Body() body: unknown): Promise<Application> {
    const { jobId, anyCompany } = parse(applySchema, body);
    return this.apply.request(jobId, anyCompany);
  }

  /** Apply to the strongest fresh matches, one per company. */
  @Post('applications/top')
  async top(@Body() body: unknown): Promise<{ queued: number }> {
    return { queued: await this.apply.requestTop(parse(topSchema, body).limit) };
  }

  @Post('applications/shortlist')
  async shortlist(@Body() body: unknown): Promise<{ ok: true }> {
    const { jobId, on } = parse(shortlistSchema, body);
    await this.apply.shortlist(jobId, on);
    return { ok: true };
  }

  /** Answer the question an application is waiting on, then carry on applying. */
  @Post('applications/:id/answer')
  answer(@Param('id') id: string, @Body() body: unknown): Promise<Application> {
    return this.apply.answerPending(id, parse(answerSchema, body).answer);
  }

  @Post('applications/:id/retry')
  retry(@Param('id') id: string): Promise<Application> {
    return this.apply.retry(id);
  }

  /** The answer bank. */
  @Get('answers')
  answers(): Promise<Answer[]> {
    return this.prisma.answer.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  /** Correct a saved answer. It is used from then on. */
  @Put('answers/:id')
  updateAnswer(@Param('id') id: string, @Body() body: unknown): Promise<Answer> {
    return this.prisma.answer.update({
      where: { id },
      data: { answer: parse(answerSchema, body).answer, source: 'user' },
    });
  }

  @Get('settings')
  async settings(): Promise<{ angelMode: boolean; aiEnabled: boolean }> {
    const profile = await this.prisma.profile.findFirst();
    return { angelMode: profile?.angelMode ?? false, aiEnabled: this.apply.aiEnabled };
  }

  @Put('settings')
  async saveSettings(@Body() body: unknown): Promise<{ angelMode: boolean; aiEnabled: boolean }> {
    const { angelMode } = parse(settingsSchema, body);
    await this.prisma.profile.updateMany({ data: { angelMode } });
    return this.settings();
  }
}
