import type { Job, Profile } from '@prisma/client';
import { z } from 'zod';

/** One question a recruiter's form asks, with its choices when it is multiple choice. */
export interface ApplyQuestion {
  question: string;
  options: string[];
}

/** A question and the answer that was sent, with who wrote it: "profile", "user" or "angel". */
export interface AnsweredQuestion {
  q: string;
  a: string;
  src: string;
}

/** The same question matches whatever its case or spacing. */
export const questionKey = (question: string): string =>
  question.toLowerCase().replace(/\s+/g, ' ').trim();

/** The offered choice that equals `answer`, ignoring case. A choice form only accepts its own choices. */
export const pickOption = (
  options: string[],
  answer: string,
): string | undefined =>
  options.find((o) => o.trim().toLowerCase() === answer.trim().toLowerCase());

const norm = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9+#]/g, '');

const skillYearsSchema = z.object({
  skillYears: z.record(z.string(), z.number()).default({}),
});

/**
 * What the saved Naukri profile itself answers: notice period, salary, city, years of experience.
 * Returns nothing for anything else, so the caller can ask the user or Angel mode.
 */
export function profileAnswer(
  profile: Profile,
  { question, options }: ApplyQuestion,
): string | undefined {
  const text = question.toLowerCase();
  if (options.length) {
    if (/city|location|relocat|residing/.test(text)) {
      // A city she lists as preferred ("Bangalore/Bengaluru") or the one she lives in.
      const cities = [
        ...profile.preferredCities.flatMap((c) => c.split('/')),
        profile.currentLocation ?? '',
      ]
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);
      return options.find((o) =>
        cities.some((c) => o.toLowerCase().includes(c)),
      );
    }
    if (/notice period/.test(text) && profile.noticePeriodDays !== null) {
      const days = profile.noticePeriodDays;
      const months = Math.round(days / 30);
      return options.find((o) =>
        new RegExp(`\\b(${days} days?|${months} months?)\\b`, 'i').test(o),
      );
    }
    return undefined;
  }
  if (/notice period/.test(text) && profile.noticePeriodDays !== null) {
    return `${profile.noticePeriodDays} days`;
  }
  // Salary is only answered when the question names the unit, so a figure in lakhs is never read as rupees.
  const inLakhs = /lakh|lac|lpa/.test(text);
  if (/(current|present).*(ctc|salary|compensation)/.test(text)) {
    return inLakhs && profile.currentCtcLpa !== null
      ? String(Number(profile.currentCtcLpa))
      : undefined;
  }
  if (/expect.*(ctc|salary|compensation)/.test(text)) {
    return inLakhs && profile.expectedCtcLpa !== null
      ? String(Number(profile.expectedCtcLpa))
      : undefined;
  }
  if (/(current|present).*(location|city)|where.*(located|based|residing)/.test(text)) {
    return profile.currentLocation ?? undefined;
  }
  const experience =
    /years? of (?:relevant |total |overall |work )?experience(?: do you have)?(?: in| with| on)? ?(.*?)\??$/.exec(
      text,
    );
  if (experience) {
    const total = String(Math.floor(profile.totalExpMonths / 12));
    const skill = norm(experience[1] ?? '');
    if (!skill || /^(total|overall|it|software|theitindustry)$/.test(skill)) {
      return total;
    }
    const stated = skillYearsSchema.safeParse(profile.resumeData);
    const years = Object.entries(stated.success ? stated.data.skillYears : {});
    const match = years.find(([name]) => norm(name) === skill);
    return match ? String(match[1]) : undefined;
  }
  return undefined;
}

export const angelSchema = z.object({
  answer: z.string(),
  basis: z.string(),
});

export const ANGEL_SYSTEM = `You answer one recruiter screening question on behalf of a job applicant, so the application goes through and the recruiter sees the profile.

Rules, in this order:
1. Facts come only from the applicant facts given. A skill, tool, certification, degree or number that is not in the facts is answered truthfully: 0 years, or No. Never invent experience.
2. Availability and willingness are answered favourably: available for interviews, willing to relocate to a preferred location, fine with the stated work mode or shift, able to join after the notice period.
3. If asked to name an interview date or time, give the date two days after today. If that is a Sunday, give the Monday after. For a time, say any time between 10 am and 6 pm.
4. Salary uses the current and expected figures in the facts, never a higher one.
5. If choices are given, the answer must be exactly one of them, copied character for character.
6. For an open question, write two or three plain sentences from her real experience. No buzzwords.

Reply with the answer the form should receive, and one short line on what it is based on.`;

const lines = (items: unknown, keys: string[]): string =>
  (Array.isArray(items) ? items : [])
    .map((item) =>
      keys
        .map((key) => (item as Record<string, unknown>)[key])
        .filter((v) => typeof v === 'string' && v)
        .join(' | '),
    )
    .join('\n');

/** The facts Angel mode may use, and the question. */
export function angelPrompt(
  profile: Profile,
  job: Pick<Job, 'title' | 'company' | 'location'>,
  { question, options }: ApplyQuestion,
  today: Date,
): string {
  const resume = (profile.resumeData ?? {}) as Record<string, unknown>;
  return `Today: ${today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}

Applicant facts
Total experience: ${Math.floor(profile.totalExpMonths / 12)} years ${profile.totalExpMonths % 12} months
Headline: ${profile.headline ?? ''}
Skills: ${profile.skills.join(', ')}
Years per skill: ${JSON.stringify(resume.skillYears ?? {})}
Current city: ${profile.currentLocation ?? 'not stated'}
Preferred locations: ${profile.preferredCities.join(', ')}
Notice period: ${profile.noticePeriodDays ?? 'not stated'} days
Current CTC: ${String(profile.currentCtcLpa ?? 'not stated')} lakhs a year
Expected CTC: ${String(profile.expectedCtcLpa ?? 'not stated')} lakhs a year
Summary: ${(resume.summary as string) ?? ''}
Work history:
${lines(resume.employments, ['designation', 'organization', 'startDate', 'endDate', 'jobDescription'])}
Education:
${lines(resume.educations, ['institute'])}

Job applied to: ${job.title} at ${job.company}, ${job.location ?? ''}

Question: ${question}${options.length ? `\nChoices: ${options.join(' | ')}` : ''}`;
}
