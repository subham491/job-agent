import type { Profile } from '@prisma/client';

export interface KeywordAdvice {
  keyword: string;
  searches: number;
  /** Where the profile already backs this keyword up. */
  evidence?: string;
}

export interface ProfileAdvice {
  /** Already in the key skills or headline, word for word. */
  covered: KeywordAdvice[];
  /** Backed by the profile but not in the key skills in the recruiters' wording: safe to add. */
  add: KeywordAdvice[];
  /** Nothing on the profile backs these. Never added automatically: only the user can say they are true. */
  unproven: KeywordAdvice[];
}

const norm = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9+#]/g, '');

const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(strings)
      : [];

/** True when `word` stands on its own in `text`, so "ai" is not found inside "email". */
const hasWord = (text: string, word: string): boolean => {
  const at = text.indexOf(word);
  if (at < 0) return false;
  const edge = (ch?: string) => !ch || !/[a-z0-9]/.test(ch);
  return (
    (edge(text[at - 1]) && edge(text[at + word.length])) ||
    hasWord(text.slice(at + 1), word)
  );
};

/** Sorts the words recruiters search into what the profile has, what it can honestly add, and what it cannot. */
export function adviseKeywords(
  profile: Pick<Profile, 'skills' | 'headline' | 'resumeData'>,
  keywords: { keyword: string; searches: number }[],
): ProfileAdvice {
  const listed = new Set(profile.skills.map((s) => s.toLowerCase()));
  const headline = (profile.headline ?? '').toLowerCase();
  const history = strings(profile.resumeData).join('\n').toLowerCase();
  const advice: ProfileAdvice = { covered: [], add: [], unproven: [] };

  for (const item of keywords) {
    const word = item.keyword.toLowerCase();
    const key = norm(word);
    if (listed.has(word) || hasWord(headline, word)) {
      advice.covered.push(item);
      continue;
    }
    // Same skill in another spelling ("Reactjs" for "react.js"), or a shorter name for a listed one ("Spring" for "Spring Boot").
    const close = profile.skills.find(
      (s) => norm(s) === key || (key.length >= 3 && norm(s).includes(key)),
    );
    if (close) {
      advice.add.push({ ...item, evidence: `Listed as "${close}"` });
    } else if (hasWord(history, word)) {
      advice.add.push({ ...item, evidence: 'Named in the work history' });
    } else {
      advice.unproven.push(item);
    }
  }
  return advice;
}

/** Naukri's cap on the key skills field: all skills joined by commas. The form stops accepting letters beyond it. */
export const KEY_SKILLS_LIMIT = 250;

const sameText = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The key skills list after an approved change. Refuses anything Naukri would cut short or that
 * does not match the current list, so a bad request fails here and not halfway through the form.
 */
export function planKeySkills(
  current: string[],
  change: { add: string[]; remove: string[] },
): string[] {
  const unknown = change.remove.filter(
    (r) => !current.some((c) => sameText(c, r)),
  );
  if (unknown.length) {
    throw new Error(`Not in the key skills: ${unknown.join(', ')}`);
  }
  const kept = current.filter(
    (c) => !change.remove.some((r) => sameText(c, r)),
  );
  const added = change.add.map((a) => a.trim());
  const invalid = added.filter(
    (a, i) =>
      !a ||
      a.includes(',') ||
      kept.some((k) => sameText(k, a)) ||
      added.findIndex((other) => sameText(other, a)) !== i,
  );
  if (invalid.length) {
    throw new Error(`Empty, repeated or containing a comma: ${invalid.join(', ')}`);
  }
  const next = [...kept, ...added];
  const length = next.join(',').length;
  if (length > KEY_SKILLS_LIMIT) {
    throw new Error(
      `Key skills would be ${length} characters; Naukri allows ${KEY_SKILLS_LIMIT}. Remove ${length - KEY_SKILLS_LIMIT} more.`,
    );
  }
  return next;
}

/**
 * Key skills with the ones recruiters search most first (Naukri's own advice: most relevant skills first).
 * Nothing is added or removed, and skills that tie keep their current order.
 */
export function orderKeySkills(
  current: string[],
  keywords: { keyword: string; searches: number }[],
): string[] {
  const searched = (skill: string): number => {
    const key = norm(skill);
    // Every spelling of the same skill counts ("React.js", "Reactjs", "React Js").
    const exact = keywords.filter((k) => norm(k.keyword) === key);
    if (exact.length) return exact.reduce((sum, k) => sum + k.searches, 0);
    // Otherwise the best shorter name it contains ("Rest Api" inside "Rest API Design").
    const inside = keywords.filter(
      (k) => norm(k.keyword).length >= 3 && key.includes(norm(k.keyword)),
    );
    return Math.max(0, ...inside.map((k) => k.searches));
  };
  return current
    .map((skill, index) => ({ skill, index, searches: searched(skill) }))
    .sort((a, b) => b.searches - a.searches || a.index - b.index)
    .map((s) => s.skill);
}

/** The most searched keywords that the headline does not contain. Advice only: the agent does not edit the headline. */
export function headlineGaps(
  headline: string | null,
  keywords: { keyword: string; searches: number }[],
  top = 5,
): string[] {
  const text = (headline ?? '').toLowerCase();
  return keywords
    .slice(0, top)
    .map((k) => k.keyword)
    .filter((keyword) => !hasWord(text, keyword.toLowerCase()));
}
