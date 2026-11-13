import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NaukriDay, Profile } from '@prisma/client';
import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { NaukriConnector } from '../connectors/naukri/naukri.connector.js';
import type { NaukriPerformance } from '../connectors/naukri/naukri.mapper.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import {
  BOOST_SYSTEM,
  boostPrompt,
  boostSchema,
  checkBoost,
  checkOrder,
  ORDER_SYSTEM,
  orderSchema,
  type CheckedBoost,
} from './boost.js';
import { adviseKeywords, orderKeySkills } from './optimise.js';

const REFRESH_QUEUE = 'naukri-refresh';
const INDIA = 'Asia/Kolkata';

const keySkillsSchema = z.object({ keySkills: z.array(z.string()) });
export const keySkillsOf = (profile: Profile): string[] =>
  keySkillsSchema.parse(profile.resumeData).keySkills;

/** A calendar day as Postgres stores a DATE: midnight UTC of that day. */
const day = (isoDate: string): Date => new Date(`${isoDate}T00:00:00Z`);
/** en-CA formats as YYYY-MM-DD. */
const todayInIndia = (): Date =>
  day(new Date().toLocaleDateString('en-CA', { timeZone: INDIA }));

export interface RefreshResult {
  refreshedAt: Date;
  /** Skills that moved up because recruiters search them more. Empty when the order was already right. */
  movedUp: string[];
  keySkills: string[];
  performance: NaukriPerformance;
}

@Injectable()
export class ProfileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfileService.name);
  private boss?: PgBoss;

  constructor(
    private readonly prisma: PrismaService,
    private readonly naukri: NaukriConnector,
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
    private readonly ai: AiService,
  ) {}

  /** Copies the logged-in Naukri profile into ours, then rescores the saved jobs against it. */
  async sync(): Promise<Profile> {
    const data = await this.naukri.profile();
    const profile = await this.prisma.profile.upsert({
      where: { email: data.email },
      create: data,
      update: data,
    });
    await this.jobs.scoreAll();
    return profile;
  }

  /**
   * The daily visibility routine. Recruiters can sort search results by how fresh a profile is,
   * and Naukri advises putting the most relevant skills first, so this:
   *  1. logs in and records the day's search appearances,
   *  2. puts the key skills recruiters searched most at the front (nothing added or removed),
   *  3. saves the key skills, which is what moves Naukri's "last modified" time even when nothing changed.
   */
  async refresh(): Promise<RefreshResult> {
    const profile = await this.sync();
    const before = keySkillsOf(profile);
    const performance = await this.naukri.performance();
    await this.prisma.$transaction(
      // The 7-day window comes as single days, which is what the daily record keeps.
      performance.buckets
        .filter(({ from, to }) => from === to)
        .map(({ from, appearances }) =>
          this.prisma.naukriDay.upsert({
            where: { date: day(from) },
            create: { date: day(from), appearances },
            update: { appearances },
          }),
        ),
    );
    const byRule = orderKeySkills(before, performance.keywords);
    const byAi = await this.aiOrder(profile, byRule, performance);
    await this.naukri.setKeySkills(byAi?.order ?? byRule);
    // Read it back from Naukri rather than trusting the form.
    const keySkills = keySkillsOf(await this.sync());
    const movedUp = keySkills.filter(
      (skill, i) => before.indexOf(skill) > i,
    );
    const refreshedAt = new Date();
    const note =
      (movedUp.length
        ? `Moved up: ${movedUp.join(', ')}`
        : 'Saved unchanged to stay fresh') +
      (byAi ? `. AI: ${byAi.why}` : '');
    await this.prisma.naukriDay.upsert({
      where: { date: todayInIndia() },
      create: { date: todayInIndia(), refreshedAt, note },
      update: { refreshedAt, note },
    });
    return { refreshedAt, movedUp, keySkills, performance };
  }

  /**
   * Asks Claude for the key skills order, starting from the rule-based one. Returns nothing when AI is off,
   * fails, or answers with anything but the exact same skills, so the daily routine never depends on it.
   */
  private async aiOrder(
    profile: Profile,
    byRule: string[],
    performance: NaukriPerformance,
  ): Promise<{ order: string[]; why: string } | undefined> {
    if (!this.ai.enabled) return undefined;
    try {
      const roles = (profile.resumeData as { desiredRoles?: string[] } | null)
        ?.desiredRoles;
      const answer = await this.ai.ask(
        ORDER_SYSTEM,
        `Key skills, currently ordered by search count alone:\n${byRule.join('\n')}\n\nTarget roles: ${(roles ?? []).join(', ')}\n\nRecruiter searches in the last 7 days (count): ${performance.keywords.map((k) => `${k.keyword} (${k.searches})`).join(', ')}`,
        orderSchema,
      );
      const order = checkOrder(byRule, answer.order);
      if (!order) this.logger.warn('AI order was not the same skills; using the rule-based order');
      return order && { order, why: answer.why.slice(0, 160) };
    } catch (error) {
      this.logger.warn(`AI order failed, using the rule-based order: ${(error as Error).message}`);
      return undefined;
    }
  }

  /**
   * Profile boost, step 1: Claude proposes a new headline and key skills list from the profile and
   * 90 days of recruiter searches. Read only: nothing on Naukri changes until `applyBoost`.
   */
  async proposeBoost(): Promise<{
    current: { headline: string; keySkills: string[] };
    proposed: CheckedBoost;
    why: { headline: string; keySkills: string };
  }> {
    this.ai.requireEnabled();
    const profile = await this.sync();
    const performance = await this.naukri.performance(90);
    const current = {
      headline: profile.headline ?? '',
      keySkills: keySkillsOf(profile),
    };
    const advice = adviseKeywords(profile, performance.keywords);
    const answer = await this.ai.ask(
      BOOST_SYSTEM,
      boostPrompt(profile, current.keySkills, advice, 90),
      boostSchema,
    );
    return {
      current,
      // Only words the profile already backs may be added, whatever the model says.
      proposed: checkBoost(current, answer, [
        // "covered" includes words that are in the headline but not yet a key skill.
        ...advice.covered.map((a) => a.keyword),
        ...advice.add.map((a) => a.keyword),
        ...profile.skills,
      ]),
      why: { headline: answer.headlineWhy, keySkills: answer.keySkillsWhy },
    };
  }

  /** Profile boost, step 2: writes the approved headline and key skills to Naukri and reads them back. */
  async applyBoost(approved: {
    headline?: string;
    keySkills?: string[];
  }): Promise<{ headline: string; keySkills: string[] }> {
    if (approved.headline !== undefined) {
      await this.naukri.setHeadline(approved.headline);
    }
    if (approved.keySkills) await this.naukri.setKeySkills(approved.keySkills);
    const profile = await this.sync();
    return { headline: profile.headline ?? '', keySkills: keySkillsOf(profile) };
  }

  /** The record that shows whether refreshing helps: appearances per day beside the days the agent refreshed. */
  days(): Promise<NaukriDay[]> {
    return this.prisma.naukriDay.findMany({
      orderBy: { date: 'desc' },
      take: 60,
    });
  }

  /** The schedule is opt-in: without NAUKRI_REFRESH_CRON nothing runs unless the endpoint is called. */
  async onModuleInit(): Promise<void> {
    const cron = this.config.get<string>('NAUKRI_REFRESH_CRON');
    if (!cron) return;
    this.boss = new PgBoss(this.config.getOrThrow<string>('DATABASE_URL'));
    this.boss.on('error', (error) => this.logger.error(error));
    await this.boss.start();
    await this.boss.createQueue(REFRESH_QUEUE);
    await this.boss.schedule(REFRESH_QUEUE, cron, null, { tz: INDIA });
    await this.boss.work(REFRESH_QUEUE, () => this.scheduledRefresh());
    this.logger.log(`Naukri refresh scheduled: "${cron}" India time`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop();
  }

  /**
   * The cron may tick many times a day (so a PC that was off at 9am still catches up);
   * this makes sure the profile is refreshed once, and that a day Naukri asked for the
   * user (login, OTP, CAPTCHA) is left alone instead of retried every hour.
   */
  private async scheduledRefresh(): Promise<void> {
    const date = todayInIndia();
    const today = await this.prisma.naukriDay.findUnique({ where: { date } });
    if (today?.refreshedAt || today?.note?.startsWith('Stopped')) {
      this.logger.debug('Naukri refresh already handled today, skipping');
      return;
    }
    try {
      const { movedUp } = await this.refresh();
      this.logger.log(`Naukri profile refreshed, ${movedUp.length} skills moved up`);
    } catch (error) {
      const note = `Stopped: ${(error as Error).message}`.slice(0, 200);
      this.logger.warn(note);
      await this.prisma.naukriDay.upsert({
        where: { date },
        create: { date, note },
        update: { note },
      });
    }
  }
}
