import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import type { NaukriDay, Profile } from '@prisma/client';
import { z } from 'zod';
import { reportNeedsUser } from '../connectors/job-connector.js';
import {
  NaukriConnector,
  type PerformanceWindow,
} from '../connectors/naukri/naukri.connector.js';
import type { NaukriPerformance } from '../connectors/naukri/naukri.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HEADLINE_LIMIT } from './boost.js';
import {
  adviseKeywords,
  headlineGaps,
  KEY_SKILLS_LIMIT,
  orderKeySkills,
  planKeySkills,
  type ProfileAdvice,
} from './optimise.js';
import {
  keySkillsOf,
  ProfileService,
  type RefreshResult,
} from './profile.service.js';

const windowSchema = z
  .enum(['7', '30', '90'])
  .transform((days) => Number(days) as PerformanceWindow);

const approvedBoostSchema = z
  .object({
    headline: z
      .string()
      .trim()
      .max(HEADLINE_LIMIT)
      .refine((h) => h.split(/\s+/).length >= 5, 'at least 5 words')
      .optional(),
    keySkills: z
      .array(z.string().trim().min(1).refine((s) => !s.includes(','), 'no commas'))
      .min(1)
      .refine(
        (list) => list.join(',').length <= KEY_SKILLS_LIMIT,
        `all skills joined by commas must fit in ${KEY_SKILLS_LIMIT} characters`,
      )
      .refine(
        (list) => new Set(list.map((s) => s.toLowerCase())).size === list.length,
        'no skill twice',
      )
      .optional(),
  })
  .refine((b) => b.headline !== undefined || b.keySkills, 'send a headline, key skills, or both');

const changeSchema = z.object({
  add: z.array(z.string()).max(30).default([]),
  remove: z.array(z.string()).max(30).default([]),
});

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly naukri: NaukriConnector,
    private readonly profiles: ProfileService,
  ) {}

  /** The single user profile. */
  @Get()
  async get(): Promise<Profile> {
    const profile = await this.prisma.profile.findFirst();
    if (!profile) {
      throw new NotFoundException('No profile yet. POST /api/profile/sync/naukri');
    }
    return profile;
  }

  /** Copies the logged-in Naukri profile into ours, then rescores the saved jobs against it. */
  @Post('sync/naukri')
  syncFromNaukri(): Promise<Profile> {
    return reportNeedsUser(() => this.profiles.sync());
  }

  /**
   * Reads how recruiters found the profile over the last 7, 30 or 90 days and what would make
   * it rank better: POST /api/profile/report/naukri?days=30. Read only: it changes nothing on Naukri.
   * Naukri keeps 90 days; anything longer comes from GET /api/profile/visibility, the agent's own record.
   */
  @Post('report/naukri')
  async report(@Query('days') days?: string): Promise<{
    days: PerformanceWindow;
    performance: NaukriPerformance;
    advice: ProfileAdvice;
    headlineMissing: string[];
    keySkills: {
      list: string[];
      /** The same skills with the most searched first: what the daily refresh would save. */
      bestOrder: string[];
      charsUsed: number;
      charsAllowed: number;
    };
  }> {
    const window = windowSchema.safeParse(days ?? '7');
    if (!window.success) {
      throw new BadRequestException('days must be 7, 30 or 90');
    }
    const [profile, performance] = await reportNeedsUser(async () => [
      await this.profiles.sync(),
      await this.naukri.performance(window.data),
    ] as const);
    const list = keySkillsOf(profile);
    return {
      days: window.data,
      performance,
      advice: adviseKeywords(profile, performance.keywords),
      headlineMissing: headlineGaps(profile.headline, performance.keywords),
      keySkills: {
        list,
        bestOrder: orderKeySkills(list, performance.keywords),
        charsUsed: list.join(',').length,
        charsAllowed: KEY_SKILLS_LIMIT,
      },
    };
  }

  /**
   * Runs the daily visibility routine now: record search appearances, put the most searched
   * key skills first, and re-save so the profile counts as fresh. Adds and removes nothing.
   */
  @Post('refresh/naukri')
  refresh(): Promise<RefreshResult> {
    return reportNeedsUser(() => this.profiles.refresh());
  }

  /**
   * Profile boost, step 1: Claude proposes a better headline and key skills list from the profile
   * and 90 days of recruiter searches. Read only. Needs ANTHROPIC_API_KEY.
   */
  @Post('boost/naukri')
  proposeBoost(): ReturnType<ProfileService['proposeBoost']> {
    return reportNeedsUser(() => this.profiles.proposeBoost());
  }

  /**
   * Profile boost, step 2: writes the headline and key skills in the body to the live Naukri profile.
   * Calling this is the approval, so send the proposal as you want it, edited or not.
   */
  @Post('boost/naukri/apply')
  async applyBoost(
    @Body() body: unknown,
  ): Promise<{ headline: string; keySkills: string[] }> {
    const approved = approvedBoostSchema.safeParse(body);
    if (!approved.success) {
      throw new BadRequestException(z.prettifyError(approved.error));
    }
    return reportNeedsUser(() => this.profiles.applyBoost(approved.data));
  }

  /** Search appearances per day beside the days the agent refreshed the profile. */
  @Get('visibility')
  visibility(): Promise<NaukriDay[]> {
    return this.profiles.days();
  }

  /**
   * Changes the key skills on the live Naukri profile. Calling this is the approval:
   * it does exactly the adds and removes in the body, or nothing.
   */
  @Post('keyskills/naukri')
  async changeKeySkills(
    @Body() body: unknown,
  ): Promise<{ before: string[]; after: string[] }> {
    const change = changeSchema.safeParse(body);
    if (!change.success || !(change.data.add.length + change.data.remove.length)) {
      throw new BadRequestException(
        'Send { "add": [...], "remove": [...] } with at least one skill',
      );
    }
    return reportNeedsUser(async () => {
      const before = keySkillsOf(await this.profiles.sync());
      let next: string[];
      try {
        next = planKeySkills(before, change.data);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      await this.naukri.setKeySkills(next);
      // Read it back from Naukri rather than trusting the form.
      return { before, after: keySkillsOf(await this.profiles.sync()) };
    });
  }
}
