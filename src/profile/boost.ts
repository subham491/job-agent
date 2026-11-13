import type { Profile } from '@prisma/client';
import { z } from 'zod';
import { KEY_SKILLS_LIMIT, type ProfileAdvice } from './optimise.js';

/** Naukri's cap on the resume headline, and its "minimum 5 words" rule. */
export const HEADLINE_LIMIT = 250;
const HEADLINE_MIN_WORDS = 5;

export const boostSchema = z.object({
  headline: z.string(),
  headlineWhy: z.string(),
  /** The full key skills list in the order it should appear. */
  keySkills: z.array(z.string()),
  keySkillsWhy: z.string(),
});
export type BoostProposal = z.infer<typeof boostSchema>;

export const orderSchema = z.object({
  order: z.array(z.string()),
  why: z.string(),
});

const same = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export const BOOST_SYSTEM = `You improve a job seeker's Naukri.com profile so that recruiter searches find it and recruiters open it.

You write two things: the resume headline and the key skills list.

Truth comes first. Use only what the profile and work history below state. Never add a skill, tool, title, seniority, certification or number that is not there. A skill may be added to the key skills only if it appears in the "may be added" list, which holds recruiter-searched words the profile already backs.

Headline: at most ${HEADLINE_LIMIT} characters and at least ${HEADLINE_MIN_WORDS} words. Lead with the role recruiters search most that she actually holds, then years of experience, then her strongest searched skills in the recruiters' own wording. Plain words, no buzzwords, no first person.

Key skills: all skills joined by commas must fit in ${KEY_SKILLS_LIMIT} characters, so choose. Keep what recruiters search, drop what nobody searched when space is needed, and put the most searched first. Use the recruiters' wording where the profile backs it. No duplicates, no commas inside a skill.

Give a short plain reason for each.`;

export const ORDER_SYSTEM = `You order the key skills on a job seeker's Naukri.com profile. Naukri advises listing the most relevant skills first. Put first the skills that recruiters searched most and that matter most for her target roles. Return exactly the same skills, spelled exactly the same, with none added and none removed. Give one short sentence on why.`;

const pick = (items: unknown, keys: string[]): string =>
  (Array.isArray(items) ? items : [])
    .map((item) =>
      keys
        .map((key) => (item as Record<string, unknown>)[key])
        .filter((v) => typeof v === 'string' && v)
        .join(' | '),
    )
    .join('\n');

const counted = (list: { keyword: string; searches: number }[]): string =>
  list.map((k) => `${k.keyword} (${k.searches})`).join(', ') || 'none';

/** Everything the model may use, as plain text. */
export function boostPrompt(
  profile: Profile,
  keySkills: string[],
  advice: ProfileAdvice,
  windowDays: number,
): string {
  const resume = (profile.resumeData ?? {}) as Record<string, unknown>;
  return `Current headline (${(profile.headline ?? '').length} characters):
${profile.headline ?? ''}

Current key skills (${keySkills.join(',').length} of ${KEY_SKILLS_LIMIT} characters):
${keySkills.join(', ')}

Total experience: ${Math.floor(profile.totalExpMonths / 12)} years ${profile.totalExpMonths % 12} months
Target roles: ${((resume.desiredRoles as string[]) ?? []).join(', ')}
Preferred locations: ${profile.preferredCities.join(', ')}
All skills on the profile: ${profile.skills.join(', ')}

Profile summary:
${(resume.summary as string) ?? ''}

Work history:
${pick(resume.employments, ['designation', 'organization', 'startDate', 'endDate', 'jobDescription'])}

Projects:
${pick(resume.projects, ['projectTitle', 'projectDetails'])}

What recruiters searched when her profile came up in the last ${windowDays} days (number of searches):
Already on the profile word for word: ${counted(advice.covered)}
May be added, the profile backs them: ${counted(advice.add)}
Not backed by the profile, never add: ${counted(advice.unproven.slice(0, 40))}`;
}

export interface CheckedBoost {
  headline: string;
  keySkills: string[];
  added: string[];
  dropped: string[];
  /** What the model proposed that the rules threw out, with the reason. Empty when it behaved. */
  rejected: string[];
}

/**
 * The model's proposal after the hard rules: nothing unbacked is added, both fields fit Naukri's limits.
 * Anything that breaks a rule is removed and reported, so a bad answer degrades to a smaller change.
 */
export function checkBoost(
  current: { headline: string; keySkills: string[] },
  proposal: BoostProposal,
  mayAdd: string[],
): CheckedBoost {
  const rejected: string[] = [];
  const keySkills: string[] = [];
  for (const raw of proposal.keySkills) {
    const skill = raw.trim();
    const known = current.keySkills.some((c) => same(c, skill));
    if (!skill || skill.includes(',')) {
      rejected.push(`"${raw}": not a valid skill`);
    } else if (keySkills.some((k) => same(k, skill))) {
      rejected.push(`"${skill}": listed twice`);
    } else if (!known && !mayAdd.some((m) => same(m, skill))) {
      rejected.push(`"${skill}": nothing on the profile backs it`);
    } else if ([...keySkills, skill].join(',').length > KEY_SKILLS_LIMIT) {
      rejected.push(`"${skill}": past the ${KEY_SKILLS_LIMIT} character limit`);
    } else {
      keySkills.push(skill);
    }
  }
  let headline = proposal.headline.trim().replace(/\s+/g, ' ');
  if (
    headline.length > HEADLINE_LIMIT ||
    headline.split(' ').length < HEADLINE_MIN_WORDS
  ) {
    rejected.push(`headline: ${headline.length} characters, kept the current one`);
    headline = current.headline;
  }
  // An empty list would wipe the field: keep what is there instead.
  const final = keySkills.length ? keySkills : current.keySkills;
  return {
    headline,
    keySkills: final,
    added: final.filter((k) => !current.keySkills.some((c) => same(c, k))),
    dropped: current.keySkills.filter((c) => !final.some((k) => same(k, c))),
    rejected,
  };
}

/** The model's order if it is exactly the same skills, otherwise `undefined` so the caller keeps its own. */
export function checkOrder(
  current: string[],
  order: string[],
): string[] | undefined {
  const exact =
    order.length === current.length &&
    current.every((c) => order.filter((o) => o === c).length === 1);
  return exact ? order : undefined;
}
