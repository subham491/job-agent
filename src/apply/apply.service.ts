import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ApplicationStatus, type Application, type Job, type Profile, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { AiService } from '../ai/ai.service.js';
import { NaukriConnector } from '../connectors/naukri/naukri.connector.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ANGEL_SYSTEM,
  angelPrompt,
  angelSchema,
  pickOption,
  profileAnswer,
  questionKey,
  type AnsweredQuestion,
  type ApplyQuestion,
} from './answers.js';

/** Applications a day, to keep the account looking like a person. */
export const DAILY_CAP = 15;
const INDIA = 'Asia/Kolkata';

const recordSchema = z.object({
  qa: z.array(z.object({ q: z.string(), a: z.string(), src: z.string() })).default([]),
  pending: z.object({ question: z.string(), options: z.array(z.string()) }).optional(),
});
type ApplyRecord = z.infer<typeof recordSchema>;
const recordOf = (application: Application): ApplyRecord =>
  recordSchema.parse(application.answers ?? {});

const companySite = (job: Job): boolean =>
  (job.raw as { companyApplyJob?: boolean } | null)?.companyApplyJob === true;

/** Midnight today in India, as an instant. */
const startOfDayInIndia = (): Date =>
  new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: INDIA })}T00:00:00+05:30`);

@Injectable()
export class ApplyService implements OnModuleInit {
  private readonly logger = new Logger(ApplyService.name);
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly naukri: NaukriConnector,
    private readonly ai: AiService,
  ) {}

  /** An application caught mid-flight by a restart is handed back to the user instead of being re-sent blindly. */
  async onModuleInit(): Promise<void> {
    await this.prisma.application.updateMany({
      where: { status: ApplicationStatus.APPROVED },
      data: {
        status: ApplicationStatus.NEEDS_USER,
        notes: 'Stopped: the app was restarted while applying. Press Retry.',
      },
    });
  }

  /** Whether Angel mode can actually answer: it needs the AI key. */
  get aiEnabled(): boolean {
    return this.ai.enabled;
  }

  private async profile(): Promise<Profile> {
    const profile = await this.prisma.profile.findFirst();
    if (!profile) throw new NotFoundException('No profile yet. Import it from Naukri first.');
    return profile;
  }

  /**
   * The user pressed Apply: that press is the approval. Checks the guard rails, records the
   * approval and queues the job. The application itself is sent in the background.
   */
  async request(jobId: string, anyCompany = false): Promise<Application> {
    const profile = await this.profile();
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('No such job');
    if (companySite(job)) {
      throw new BadRequestException('This job is applied to on the company site, not on Naukri');
    }
    const key = { profileId: profile.id, jobId };
    const existing = await this.prisma.application.findUnique({ where: { profileId_jobId: key } });
    if (existing?.status === ApplicationStatus.APPLIED || existing?.status === ApplicationStatus.APPROVED) {
      throw new ConflictException('Already applied or applying');
    }
    const today = await this.prisma.application.findMany({
      where: {
        profileId: profile.id,
        approvedAt: { gte: startOfDayInIndia() },
        status: { in: [ApplicationStatus.APPLIED, ApplicationStatus.APPROVED, ApplicationStatus.NEEDS_USER] },
        NOT: { jobId },
      },
      include: { job: true },
    });
    if (today.length >= DAILY_CAP) {
      throw new ConflictException(`Daily limit of ${DAILY_CAP} applications reached`);
    }
    if (!anyCompany && today.some((a) => a.job.company.toLowerCase() === job.company.toLowerCase())) {
      throw new ConflictException(`Already applied to ${job.company} today`);
    }
    const data = { status: ApplicationStatus.APPROVED, approvedAt: new Date(), notes: null };
    const application = await this.prisma.application.upsert({
      where: { profileId_jobId: key },
      create: { ...key, ...data },
      update: data,
    });
    this.enqueue(application.id);
    return application;
  }

  /** Queues the strongest fresh matches not yet applied to, one per company. Returns how many were queued. */
  async requestTop(limit: number): Promise<number> {
    const profile = await this.profile();
    const matches = await this.prisma.jobMatch.findMany({
      where: {
        profileId: profile.id,
        dismissed: false,
        score: { gte: 70 },
        job: { postedAt: { gte: new Date(Date.now() - 3 * 86_400_000) } },
      },
      orderBy: { score: 'desc' },
      include: { job: true },
      take: 200,
    });
    let queued = 0;
    for (const match of matches) {
      if (queued >= limit) break;
      // The guard rails in `request` skip company-site jobs, repeats and a second job at one company.
      const ok = await this.request(match.jobId).then(
        () => true,
        () => false,
      );
      if (ok) queued++;
    }
    return queued;
  }

  /** The user answered the question an application was stuck on: save it to the answer bank and carry on. */
  async answerPending(applicationId: string, answer: string): Promise<Application> {
    const application = await this.prisma.application.findUnique({ where: { id: applicationId } });
    const pending = application && recordOf(application).pending;
    if (!application || !pending) throw new NotFoundException('That application is not waiting on a question');
    if (pending.options.length && !pickOption(pending.options, answer)) {
      throw new BadRequestException(`Choose one of: ${pending.options.join(', ')}`);
    }
    await this.saveAnswer(pending.question, answer, 'user');
    return this.retry(applicationId);
  }

  /** Puts a stopped application back in the queue. The original approval still stands. */
  async retry(applicationId: string): Promise<Application> {
    const application = await this.prisma.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.APPROVED, notes: null },
    });
    this.enqueue(application.id);
    return application;
  }

  async shortlist(jobId: string, on: boolean): Promise<void> {
    const key = { profileId: (await this.profile()).id, jobId };
    const existing = await this.prisma.application.findUnique({ where: { profileId_jobId: key } });
    if (on && !existing) {
      await this.prisma.application.create({ data: { ...key, status: ApplicationStatus.SHORTLISTED } });
    } else if (!on && existing?.status === ApplicationStatus.SHORTLISTED) {
      await this.prisma.application.delete({ where: { id: existing.id } });
    }
  }

  list(): Promise<unknown[]> {
    return this.prisma.application.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { job: { omit: { raw: true, description: true } } },
    });
  }

  saveAnswer(question: string, answer: string, source: string): Promise<unknown> {
    const key = questionKey(question);
    return this.prisma.answer.upsert({
      where: { key },
      create: { key, question: question.trim(), answer, source },
      update: { answer, source },
    });
  }

  private enqueue(applicationId: string): void {
    this.chain = this.chain
      .then(() => this.run(applicationId))
      .catch((error: unknown) => this.logger.error(error));
  }

  private async run(applicationId: string): Promise<void> {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true, profile: true },
    });
    // Nothing is submitted unless the user approved it.
    if (!application?.approvedAt || application.status !== ApplicationStatus.APPROVED) return;
    const qa = recordOf(application).qa;
    const save = (data: Prisma.ApplicationUpdateInput) =>
      this.prisma.application.update({ where: { id: applicationId }, data });
    try {
      const result = await this.naukri.apply(application.job.externalId, (question) =>
        this.answer(application.profile, application.job, question, qa),
      );
      if (result.applied) {
        await save({ status: ApplicationStatus.APPLIED, appliedAt: new Date(), answers: { qa } });
        this.logger.log(`Applied: ${application.job.title} at ${application.job.company}`);
      } else {
        await save({ status: ApplicationStatus.NEEDS_USER, answers: { qa, pending: { ...result.pending } } });
      }
    } catch (error) {
      const notes = `Stopped: ${(error as Error).message}`.slice(0, 300);
      this.logger.warn(`${application.job.company}: ${notes}`);
      await save({ status: ApplicationStatus.NEEDS_USER, notes, answers: { qa } });
    }
  }

  /**
   * One recruiter question, answered in this order: the answer bank, the profile, then Angel mode
   * when it is on. Returns nothing when none of them has an answer the form would accept.
   */
  private async answer(
    profile: Profile,
    job: Job,
    question: ApplyQuestion,
    qa: AnsweredQuestion[],
  ): Promise<string | undefined> {
    const saved = await this.prisma.answer.findUnique({ where: { key: questionKey(question.question) } });
    let found: { a: string; src: string } | undefined = saved
      ? { a: saved.answer, src: saved.source }
      : undefined;
    const fromProfile = found ? undefined : profileAnswer(profile, question);
    if (fromProfile) found = { a: fromProfile, src: 'profile' };
    if (!found && profile.angelMode && this.ai.enabled) {
      const reply = await this.ai
        .ask(ANGEL_SYSTEM, angelPrompt(profile, job, question, new Date()), angelSchema)
        .catch((error: unknown) => {
          this.logger.warn(`Angel mode could not answer: ${(error as Error).message}`);
          return undefined;
        });
      if (reply?.answer.trim()) found = { a: reply.answer.trim(), src: 'angel' };
    }
    if (!found) return undefined;
    if (question.options.length) {
      const option = pickOption(question.options, found.a);
      // A saved or written answer that is not one of the choices cannot be sent.
      if (!option) return undefined;
      found.a = option;
    }
    if (!saved) await this.saveAnswer(question.question, found.a, found.src);
    qa.push({ q: question.question, a: found.a, src: found.src });
    return found.a;
  }
}
