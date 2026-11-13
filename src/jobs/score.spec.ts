import { scoreJob } from './score.js';

const profile = {
  skills: ['Java', 'Spring Boot', 'React.js', 'Kafka', 'MySQL', 'Docker'],
  totalExpMonths: 48,
  preferredCities: ['Remote', 'Bangalore/Bengaluru'],
};
const job = {
  title: 'Java Full Stack Developer',
  skills: ['Java', 'Spring', 'React.Js', 'AWS'],
  description: null,
  minExpYears: 4,
  maxExpYears: 9,
  location: 'Hybrid - Bengaluru, Pune',
};

describe('scoreJob', () => {
  it('scores skills, experience and location, with reasons and gaps', () => {
    const match = scoreJob(profile, job);
    // 3 of 4 skills (45) + experience fits (25) + preferred city (15)
    expect(match.score).toBe(85);
    expect(match.reasons).toEqual([
      'Has 3 of 4 listed skills: Java, Spring, React.Js',
      'Experience 4-9 years fits 4 years',
      'Preferred location: Hybrid - Bengaluru, Pune',
    ]);
    expect(match.gaps).toEqual(['Skills not on the profile: AWS']);
  });

  it('takes points off per year short and for a city that is not preferred', () => {
    const match = scoreJob(profile, {
      ...job,
      minExpYears: 6,
      maxExpYears: 10,
      location: 'Gurugram',
    });
    // 45 + (25 - 2 years x 10) + 0
    expect(match.score).toBe(50);
    expect(match.gaps).toContain('Asks for 6+ years, profile has 4');
    expect(match.gaps).toContain('Location is not a preferred city: Gurugram');
  });

  it('falls back to skills named in the text when the job lists none', () => {
    const match = scoreJob(profile, {
      ...job,
      skills: [],
      description: '<p>Java, Spring Boot and Kafka on Docker with MySQL</p>',
      location: 'Remote',
    });
    expect(match.score).toBe(100);
    expect(match.reasons[0]).toBe(
      'Mentions 5 profile skills: Java, Spring Boot, Kafka, MySQL, Docker',
    );
  });

  it('does not treat a short skill as part of every other skill', () => {
    const match = scoreJob({ ...profile, skills: ['C'] }, { ...job, skills: ['C++', 'Docker'] });
    expect(match.gaps[0]).toBe('Skills not on the profile: C++, Docker');
  });
});
