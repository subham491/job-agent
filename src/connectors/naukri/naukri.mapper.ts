import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { FoundJob, JobSearchQuery } from '../job-connector.js';

export const NAUKRI_URL = 'https://www.naukri.com';

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Naukri only keeps the filters when the path matches one keyword phrase and one city.
 * Any other path (several cities, a page suffix) is redirected and the filters are dropped.
 * shortcut: keywords with symbols (C++, C#) lose them in the path, check the filters survive before relying on those.
 */
export function searchSlug(keyword: string, location: string): string {
  return `${slug(keyword)}-jobs-in-${slug(location)}`;
}

export function searchUrl(
  keyword: string,
  location: string,
  query: Pick<JobSearchQuery, 'minExpYears' | 'postedWithinDays'>,
): string {
  const params = new URLSearchParams({ k: keyword, l: location });
  if (query.minExpYears !== undefined) {
    params.set('experience', String(query.minExpYears));
  }
  if (query.postedWithinDays !== undefined) {
    params.set('jobAge', String(query.postedWithinDays));
  }
  return `${NAUKRI_URL}/${searchSlug(keyword, location)}?${params}`;
}

const years = z.coerce.number().optional();
const shownSalary = (text?: string): string | undefined =>
  text && !/not disclosed/i.test(text) ? text : undefined;

const listingSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  companyName: z.string(),
  jdURL: z.string(),
  placeholders: z
    .array(z.object({ type: z.string(), label: z.string() }))
    .default([]),
  tagsAndSkills: z.string().optional(),
  jobDescription: z.string().optional(),
  minimumExperience: years,
  maximumExperience: years,
  createdDate: z.number().optional(),
});

/** Search results and recommended jobs share this shape. */
const listingsSchema = z.object({
  jobDetails: z.array(z.unknown()).default([]),
});

export function fromListings(body: unknown): FoundJob[] {
  return listingsSchema.parse(body).jobDetails.map((raw) => {
    const job = listingSchema.parse(raw);
    const label = (type: string) =>
      job.placeholders.find((p) => p.type === type)?.label;
    return {
      externalId: job.jobId,
      title: job.title,
      company: job.companyName,
      location: label('location'),
      minExpYears: job.minimumExperience,
      maxExpYears: job.maximumExperience,
      salaryText: shownSalary(label('salary')),
      skills: job.tagsAndSkills?.split(',').filter(Boolean) ?? [],
      description: job.jobDescription,
      url: NAUKRI_URL + job.jdURL,
      postedAt: job.createdDate ? new Date(job.createdDate) : undefined,
      raw,
    };
  });
}

const skillList = z.array(z.object({ label: z.string() })).default([]);

const postingSchema = z.object({
  jobDetails: z.object({
    jobId: z.string(),
    title: z.string(),
    companyDetail: z.object({ name: z.string() }),
    locations: z.array(z.object({ label: z.string() })).default([]),
    minimumExperience: years,
    maximumExperience: years,
    salaryDetail: z.object({ salaryText: z.string().optional() }).optional(),
    keySkills: z
      .object({ preferred: skillList, other: skillList })
      .default({ preferred: [], other: [] }),
    description: z.string().optional(),
    staticUrl: z.string(),
    /** "2026-11-12 17:32:26", India time. */
    createdDate: z.string().optional(),
  }),
});

export function fromPosting(body: unknown): FoundJob {
  const job = postingSchema.parse(body).jobDetails;
  return {
    externalId: job.jobId,
    title: job.title,
    company: job.companyDetail.name,
    location: job.locations.map((l) => l.label).join(', ') || undefined,
    minExpYears: job.minimumExperience,
    maxExpYears: job.maximumExperience,
    salaryText: shownSalary(job.salaryDetail?.salaryText),
    skills: [...job.keySkills.preferred, ...job.keySkills.other].map(
      (s) => s.label,
    ),
    description: job.description,
    url: job.staticUrl,
    postedAt: job.createdDate
      ? new Date(job.createdDate.replace(' ', 'T') + '+05:30')
      : undefined,
    raw: body,
  };
}

const named = z.object({ value: z.string() });
const sections = z.array(z.unknown()).default([]);

const profileSchema = z.object({
  user: z.object({ email: z.string(), mobile: z.string().nullish() }),
  itskills: z
    .array(
      z.object({
        skill: z.string(),
        experienceTime: z.object({ year: z.coerce.number() }).nullish(),
      }),
    )
    .default([]),
  employments: sections,
  projects: sections,
  educations: sections,
  profile: z
    .array(
      z.object({
        name: z.string(),
        keySkills: z.string().default(''),
        resumeHeadline: z.string().nullish(),
        summary: z.string().nullish(),
        experience: z.object({
          year: z.coerce.number(),
          month: z.coerce.number(),
        }),
        city: named.nullish(),
        newLocationPrefId: z.array(named).default([]),
        desiredRole: z.array(named).default([]),
        /** Rupees a year. */
        absoluteCtc: z.coerce.number().nullish(),
        absoluteExpectedCtc: z.coerce.number().nullish(),
        noticePeriod: named.nullish(),
      }),
    )
    .min(1),
});

/** "15 Days or less" -> 15, "1 Month" -> 30. "Serving Notice Period" has no number, so it is left unset. */
export function noticeDays(text?: string | null): number | undefined {
  const match = /(\d+)\s*(day|month)/i.exec(text ?? '');
  if (!match) return undefined;
  return Number(match[1]) * (match[2]?.toLowerCase() === 'month' ? 30 : 1);
}

const lakhs = (rupees?: number | null): number | undefined =>
  rupees ? rupees / 100_000 : undefined;

/** The logged-in user's Naukri profile, in the shape of our Profile table. */
export function fromProfile(body: unknown): Prisma.ProfileCreateInput {
  const data = profileSchema.parse(body);
  const profile = data.profile[0]!;
  const keySkills = profile.keySkills
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const skills = [...keySkills, ...data.itskills.map((s) => s.skill.trim())];
  return {
    fullName: profile.name,
    email: data.user.email,
    phone: data.user.mobile ?? undefined,
    headline: profile.resumeHeadline ?? undefined,
    totalExpMonths: profile.experience.year * 12 + profile.experience.month,
    // Same skill in both lists ("Angular", "angular") is kept once.
    skills: [...new Map(skills.map((s) => [s.toLowerCase(), s])).values()],
    currentLocation: profile.city?.value,
    preferredCities: profile.newLocationPrefId.map((c) => c.value),
    currentCtcLpa: lakhs(profile.absoluteCtc),
    expectedCtcLpa: lakhs(profile.absoluteExpectedCtc),
    noticePeriodDays: noticeDays(profile.noticePeriod?.value),
    resumeData: {
      summary: profile.summary ?? null,
      // The key skills exactly as Naukri stores them: the list recruiters search and the one we may edit.
      keySkills,
      // Years she states for each skill, for recruiter questions like "years of experience in Kafka".
      skillYears: Object.fromEntries(
        data.itskills
          .filter((s) => s.experienceTime)
          .map((s) => [s.skill.trim(), s.experienceTime!.year]),
      ),
      desiredRoles: profile.desiredRole.map((r) => r.value),
      employments: data.employments,
      projects: data.projects,
      educations: data.educations,
    } as Prisma.InputJsonObject,
  };
}

const counts = z.record(z.string(), z.number()).default({});

const performanceSchema = z.object({
  totalSearchAppearances: z.number().default(0),
  dayWiseSearchAppearance: z.number().default(0),
  percentageChange: z.number().default(0),
  recruiterActions: z.number().default(0),
  searchAppearanceTimeline: counts,
  searchKeyWords: counts,
});

export interface NaukriPerformance {
  /** Naukri's 90-day summary. Only sent with the 7-day window; 0 otherwise. */
  totalAppearances: number;
  /** Appearances inside the requested window (7, 30 or 90 days). */
  inWindow: number;
  /** Against the window before, as Naukri reports it. */
  changePercent: number;
  recruiterActions: number;
  /**
   * Appearances over time, oldest first. Naukri gives single days for a 7-day window,
   * weeks for 30 days and months for 90; a single day has `from` equal to `to`.
   */
  buckets: { from: string; to: string; appearances: number }[];
  /** Words recruiters searched when the profile came up, most searched first. */
  keywords: { keyword: string; searches: number }[];
}

export function fromPerformance(body: unknown): NaukriPerformance {
  const data = performanceSchema.parse(body);
  return {
    totalAppearances: data.totalSearchAppearances,
    inWindow: data.dayWiseSearchAppearance,
    changePercent: data.percentageChange,
    recruiterActions: data.recruiterActions,
    buckets: Object.entries(data.searchAppearanceTimeline)
      .map(([label, appearances]) => {
        // "2026-11-11" for a day, "2026-11-11 - 2026-11-04" (newest first) for a week or month.
        const [to = label, from = to] = label.split(' - ');
        return { from, to, appearances };
      })
      .sort((a, b) => a.from.localeCompare(b.from)),
    keywords: Object.entries(data.searchKeyWords)
      .map(([keyword, searches]) => ({ keyword, searches }))
      .sort((a, b) => b.searches - a.searches),
  };
}
