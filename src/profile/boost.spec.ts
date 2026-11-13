import { checkBoost, checkOrder, HEADLINE_LIMIT } from './boost.js';
import { KEY_SKILLS_LIMIT } from './optimise.js';

const current = {
  headline: 'Java developer with four years of experience',
  keySkills: ['java', 'Spring Boot', 'Sonarqube'],
};
const proposal = (over: object) => ({
  headline: 'Java Full Stack Developer with 4 years in Spring Boot and React',
  headlineWhy: '',
  keySkills: ['Spring Boot', 'java', 'Rest Api'],
  keySkillsWhy: '',
  ...over,
});

describe('checkBoost', () => {
  it('accepts a backed proposal and reports what was added and dropped', () => {
    expect(checkBoost(current, proposal({}), ['Rest Api'])).toEqual({
      headline: 'Java Full Stack Developer with 4 years in Spring Boot and React',
      keySkills: ['Spring Boot', 'java', 'Rest Api'],
      added: ['Rest Api'],
      dropped: ['Sonarqube'],
      rejected: [],
    });
  });

  it('throws out skills the profile does not back, repeats and commas', () => {
    const checked = checkBoost(
      current,
      proposal({ keySkills: ['java', 'AWS', 'JAVA', 'a,b', 'Spring Boot'] }),
      [],
    );
    expect(checked.keySkills).toEqual(['java', 'Spring Boot']);
    expect(checked.added).toEqual([]);
    expect(checked.rejected).toHaveLength(3);
    expect(checked.rejected[0]).toContain('AWS');
  });

  it('stops adding at the 250 character limit', () => {
    const long = 'x'.repeat(KEY_SKILLS_LIMIT - 'java,'.length);
    const checked = checkBoost(
      current,
      proposal({ keySkills: ['java', long, 'Spring Boot'] }),
      [long],
    );
    expect(checked.keySkills).toEqual(['java', long]);
    expect(checked.rejected[0]).toContain('Spring Boot');
  });

  it('keeps the current headline when the new one is too long or too short', () => {
    const tooLong = checkBoost(current, proposal({ headline: 'word '.repeat(60) }), ['Rest Api']);
    expect('word '.repeat(60).trim().length).toBeGreaterThan(HEADLINE_LIMIT);
    expect(tooLong.headline).toBe(current.headline);
    expect(checkBoost(current, proposal({ headline: 'Java dev' }), ['Rest Api']).headline).toBe(current.headline);
  });

  it('never empties the key skills', () => {
    expect(checkBoost(current, proposal({ keySkills: ['AWS'] }), []).keySkills).toEqual(current.keySkills);
  });
});

describe('checkOrder', () => {
  it('accepts only the exact same skills', () => {
    expect(checkOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
    expect(checkOrder(['a', 'b', 'c'], ['c', 'a'])).toBeUndefined();
    expect(checkOrder(['a', 'b', 'c'], ['c', 'a', 'B'])).toBeUndefined();
    expect(checkOrder(['a', 'b'], ['a', 'a'])).toBeUndefined();
  });
});
