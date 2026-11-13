import {
  adviseKeywords,
  headlineGaps,
  KEY_SKILLS_LIMIT,
  orderKeySkills,
  planKeySkills,
} from './optimise.js';

const profile = {
  skills: ['java', 'Spring Boot', 'react.js', 'MySQL'],
  headline: 'Java Full Stack Developer with 4 years',
  resumeData: {
    summary: 'Built services on Kafka. Sent email alerts.',
    employments: [{ jobDescription: 'CI/CD with Jenkins and Docker' }],
  },
};
const k = (keyword: string, searches = 1) => ({ keyword, searches });

describe('planKeySkills', () => {
  const current = ['java', 'Spring Boot', 'Kafka'];

  it('removes and adds, keeping the order of what stays', () => {
    expect(
      planKeySkills(current, { add: [' Rest Api '], remove: ['kafka'] }),
    ).toEqual(['java', 'Spring Boot', 'Rest Api']);
  });

  it('refuses a list longer than Naukri allows', () => {
    const long = 'x'.repeat(KEY_SKILLS_LIMIT - 'java,Spring Boot,Kafka,'.length);
    expect(planKeySkills(current, { add: [long], remove: [] })).toHaveLength(4);
    expect(() =>
      planKeySkills(current, { add: [long + 'x'], remove: [] }),
    ).toThrow(/251 characters.*Remove 1 more/);
  });

  it('refuses removing what is not there, repeats and commas', () => {
    expect(() => planKeySkills(current, { add: [], remove: ['AWS'] })).toThrow(/AWS/);
    expect(() => planKeySkills(current, { add: ['JAVA'], remove: [] })).toThrow();
    expect(() => planKeySkills(current, { add: ['a,b'], remove: [] })).toThrow();
    expect(() => planKeySkills(current, { add: ['Sql', 'sql'], remove: [] })).toThrow();
  });
});

describe('orderKeySkills', () => {
  it('puts the most searched skills first and keeps ties in place', () => {
    const order = orderKeySkills(
      ['javascript', 'Kafka', 'java', 'react.js', 'Rest API Design', 'Docker'],
      [
        k('Java', 9),
        k('React.js', 6),
        k('Reactjs', 3),
        k('Javascript', 4),
        k('Rest Api', 3),
      ],
    );
    // "java" must not borrow from "Javascript", and both React spellings add up.
    expect(order).toEqual([
      'java',
      'react.js',
      'javascript',
      'Rest API Design',
      'Kafka',
      'Docker',
    ]);
  });

  it('changes nothing when recruiters searched none of them', () => {
    expect(orderKeySkills(['a', 'b'], [k('Java', 9)])).toEqual(['a', 'b']);
  });
});

describe('headlineGaps', () => {
  it('lists top searched keywords missing from the headline', () => {
    expect(
      headlineGaps('Java Full Stack Developer, Spring Boot', [
        k('Java Fullstack', 13),
        k('Java', 9),
        k('Spring Boot', 9),
        k('Microservices', 8),
      ]),
    ).toEqual(['Java Fullstack', 'Microservices']);
  });
});

describe('adviseKeywords', () => {
  it('sorts recruiter keywords into covered, safe to add and unproven', () => {
    const advice = adviseKeywords(profile, [
      k('Java', 9),
      k('Java Full Stack Developer', 11),
      k('Reactjs', 3),
      k('Spring', 2),
      k('Kafka'),
      k('Ci/cd'),
      k('Langchain'),
    ]);
    expect(advice.covered.map((a) => a.keyword)).toEqual([
      'Java',
      'Java Full Stack Developer',
    ]);
    expect(advice.add).toEqual([
      { keyword: 'Reactjs', searches: 3, evidence: 'Listed as "react.js"' },
      { keyword: 'Spring', searches: 2, evidence: 'Listed as "Spring Boot"' },
      { keyword: 'Kafka', searches: 1, evidence: 'Named in the work history' },
      { keyword: 'Ci/cd', searches: 1, evidence: 'Named in the work history' },
    ]);
    expect(advice.unproven.map((a) => a.keyword)).toEqual(['Langchain']);
  });

  it('does not find a short keyword inside a longer word', () => {
    // "ai" is inside "email" and "sql" is a listed skill's tail, but "Ai" itself is nowhere.
    const advice = adviseKeywords(profile, [k('Ai'), k('Sql')]);
    expect(advice.unproven.map((a) => a.keyword)).toEqual(['Ai']);
    expect(advice.add.map((a) => a.keyword)).toEqual(['Sql']);
  });
});
