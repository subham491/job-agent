import type { Job, Profile } from '@prisma/client';

export interface MatchScore {
  /** 0 to 100: skills 60, experience 25, location 15. */
  score: number;
  reasons: string[];
  gaps: string[];
}

const norm = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9+#]/g, '');

/**
 * "Spring" counts when the profile has "Spring Boot", "Core Java" when it has "Java".
 * shortcut: substring match, so "Java" on the profile also counts for a "JavaScript" job; use a skill alias list if scores look generous.
 */
const sameSkill = (a: string, b: string): boolean =>
  a === b ||
  (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a)));

/** Rule-based fit of one job for one profile. Salary is not scored: most Naukri jobs hide it. */
export function scoreJob(
  profile: Pick<Profile, 'skills' | 'totalExpMonths' | 'preferredCities'>,
  job: Pick<
    Job,
    | 'title'
    | 'skills'
    | 'description'
    | 'minExpYears'
    | 'maxExpYears'
    | 'location'
  >,
): MatchScore {
  const reasons: string[] = [];
  const gaps: string[] = [];
  let score = 0;

  const mine = profile.skills.map(norm);
  if (job.skills.length) {
    const has = (skill: string) => mine.some((m) => sameSkill(m, norm(skill)));
    const matched = job.skills.filter(has);
    const missing = job.skills.filter((skill) => !has(skill));
    score += (60 * matched.length) / job.skills.length;
    if (matched.length) {
      reasons.push(
        `Has ${matched.length} of ${job.skills.length} listed skills: ${matched.join(', ')}`,
      );
    }
    if (missing.length) {
      gaps.push(`Skills not on the profile: ${missing.join(', ')}`);
    }
  } else {
    // shortcut: recommended jobs come without a skill list, so count profile skills named in the text (5 or more is full marks); score from the full posting once it is fetched.
    const text = norm(`${job.title} ${job.description ?? ''}`);
    const named = profile.skills.filter((skill) => text.includes(norm(skill)));
    score += 60 * Math.min(1, named.length / 5);
    if (named.length) {
      reasons.push(`Mentions ${named.length} profile skills: ${named.join(', ')}`);
    } else {
      gaps.push('No profile skill is mentioned in the posting');
    }
  }

  const years = Math.floor(profile.totalExpMonths / 12);
  const min = job.minExpYears ?? 0;
  const max = job.maxExpYears ?? Infinity;
  const yearsOff = Math.max(min - years, years - max, 0);
  score += Math.max(0, 25 - 10 * yearsOff);
  if (yearsOff > 0) {
    gaps.push(
      years < min
        ? `Asks for ${min}+ years, profile has ${years}`
        : `Asks for up to ${max} years, profile has ${years}`,
    );
  } else if (job.minExpYears !== null || job.maxExpYears !== null) {
    reasons.push(
      `Experience ${min}-${job.maxExpYears ?? '?'} years fits ${years} years`,
    );
  }

  const where = (job.location ?? '').toLowerCase();
  // "Bangalore/Bengaluru" is one preference with two spellings.
  const wanted = profile.preferredCities.flatMap((city) =>
    city.toLowerCase().split('/'),
  );
  if (!wanted.length || wanted.some((city) => where.includes(city.trim()))) {
    score += 15;
    if (wanted.length) reasons.push(`Preferred location: ${job.location}`);
  } else if (job.location) {
    gaps.push(`Location is not a preferred city: ${job.location}`);
  }

  return { score: Math.round(score), reasons, gaps };
}
