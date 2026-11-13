import { Injectable } from '@nestjs/common';
import type { Prisma, Site } from '@prisma/client';
import { z } from 'zod';
import type { FoundJob, JobSearchQuery } from '../connectors/job-connector.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { dedupeKey } from './dedupe.js';
import { scoreJob } from './score.js';

const desiredRolesSchema = z.object({ desiredRoles: z.array(z.string()) });

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Saves jobs not seen before and marks the rest as seen again.
   * shortcut: only skips repeats of the same site id; drop rows sharing a dedupeKey when a second site is added.
   */
  async saveFound(
    site: Site,
    jobs: FoundJob[],
  ): Promise<{ found: number; added: number }> {
    const { count } = await this.prisma.job.createMany({
      data: jobs.map((job) => ({
        ...job,
        site,
        dedupeKey: dedupeKey(job),
        raw: job.raw as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    await this.prisma.job.updateMany({
      where: { site, externalId: { in: jobs.map((job) => job.externalId) } },
      data: { lastSeenAt: new Date() },
    });
    return { found: jobs.length, added: count };
  }

  /** Scores every saved job for the single profile. Returns how many were scored (0 when there is no profile yet). */
  async scoreAll(): Promise<number> {
    const profile = await this.prisma.profile.findFirst();
    if (!profile) return 0;
    const jobs = await this.prisma.job.findMany({ omit: { raw: true } });
    await this.prisma.$transaction(
      jobs.map((job) => {
        const match = scoreJob(profile, job);
        const key = { profileId: profile.id, jobId: job.id };
        // Upsert, not replace, so a match the user dismissed stays dismissed.
        return this.prisma.jobMatch.upsert({
          where: { profileId_jobId: key },
          create: { ...key, ...match },
          update: match,
        });
      }),
    );
    return jobs.length;
  }

  /** What to search for when the caller does not say: the profile's desired roles in its preferred cities. */
  async searchDefaults(): Promise<
    Pick<JobSearchQuery, 'keywords' | 'locations' | 'minExpYears'> | undefined
  > {
    const profile = await this.prisma.profile.findFirst();
    if (!profile) return undefined;
    const roles = desiredRolesSchema.safeParse(profile.resumeData);
    return {
      keywords: roles.success ? roles.data.desiredRoles : [],
      // "Bangalore/Bengaluru" is one city with two spellings; Naukri needs one.
      locations: profile.preferredCities.map((city) => city.split('/')[0]!),
      minExpYears: Math.floor(profile.totalExpMonths / 12),
    };
  }

  /** Best matches first, posted in the last `days` days, without the ones the user dismissed. */
  async matches(minScore: number, days: number): Promise<unknown[]> {
    const rows = await this.prisma.jobMatch.findMany({
      where: {
        score: { gte: minScore },
        dismissed: false,
        job: { postedAt: { gte: new Date(Date.now() - days * 86_400_000) } },
      },
      orderBy: [{ score: 'desc' }, { job: { postedAt: 'desc' } }],
      take: 300,
      include: {
        job: {
          omit: { description: true },
          include: { applications: { select: { id: true, status: true } } },
        },
      },
    });
    // The screen needs to know how each job is applied to and where its application stands, not the raw posting.
    return rows.map(({ job: { raw, applications, ...job }, ...match }) => ({
      ...match,
      job: {
        ...job,
        companySite:
          (raw as { companyApplyJob?: boolean } | null)?.companyApplyJob === true,
      },
      application: applications[0] ?? null,
    }));
  }

  /** Hides a match from the list, or brings it back. */
  async dismiss(matchId: string, dismissed: boolean): Promise<void> {
    await this.prisma.jobMatch.update({
      where: { id: matchId },
      data: { dismissed },
    });
  }

  /** The headline numbers for the Matches screen. */
  async summary(): Promise<{
    scored: number;
    strong: number;
    applied: number;
    needsYou: number;
  }> {
    const [scored, strong, applied, needsYou] = await Promise.all([
      this.prisma.jobMatch.count(),
      this.prisma.jobMatch.count({ where: { score: { gte: 70 } } }),
      this.prisma.application.count({ where: { status: 'APPLIED' } }),
      this.prisma.application.count({ where: { status: 'NEEDS_USER' } }),
    ]);
    return { scored, strong, applied, needsYou };
  }

  latest(): Promise<unknown[]> {
    return this.prisma.job.findMany({
      orderBy: { firstSeenAt: 'desc' },
      take: 50,
      omit: { raw: true, description: true },
    });
  }
}
