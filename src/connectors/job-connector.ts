import { ConflictException } from '@nestjs/common';
import type { Site } from '@prisma/client';

export interface JobSearchQuery {
  keywords: string[];
  locations: string[];
  minExpYears?: number;
  maxExpYears?: number;
  /** Only jobs posted within this many days. */
  postedWithinDays?: number;
  /** How many result pages to read per search, starting at the first. Default 1. */
  maxPages?: number;
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

/** For controllers: a site wanting the user (login, OTP, CAPTCHA) is reported as 409, never retried around. */
export async function reportNeedsUser<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NeedsUserError) {
      throw new ConflictException(error.message);
    }
    throw error;
  }
}

export class NeedsUserError extends Error {
  constructor(
    readonly site: Site,
    readonly reason: 'captcha' | 'otp' | 'login' | 'unknown-screen',
  ) {
    super(`${site} needs the user: ${reason}`);
  }
}
