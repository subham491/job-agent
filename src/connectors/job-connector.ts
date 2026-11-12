import type { Site } from '@prisma/client';

export interface JobSearchQuery {
  keywords: string[];
  locations: string[];
  minExpYears?: number;
  maxExpYears?: number;
  /** Only jobs posted within this many days. */
  postedWithinDays?: number;
  page?: number;
}

/** A job as a site returns it, normalised to one shape before it is saved. */
export interface FoundJob {
  externalId: string;
  title: string;
  company: string;
  location?: string;
  minExpYears?: number;
  maxExpYears?: number;
  salaryText?: string;
  skills: string[];
  description?: string;
  url: string;
  applyUrl?: string;
  postedAt?: Date;
  raw?: unknown;
}

/**
 * One implementation per job site (Naukri, Hirist, ...).
 * A connector that hits a CAPTCHA, OTP or unknown screen throws NeedsUserError
 * and never tries to get past it.
 */
export interface JobConnector {
  readonly site: Site;
  search(query: JobSearchQuery): Promise<FoundJob[]>;
  getPosting(externalId: string): Promise<FoundJob>;
}

export class NeedsUserError extends Error {
  constructor(
    readonly site: Site,
    readonly reason: 'captcha' | 'otp' | 'login' | 'unknown-screen',
  ) {
    super(`${site} needs the user: ${reason}`);
  }
}
