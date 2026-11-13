import {
  fromListings,
  fromPerformance,
  fromPosting,
  fromProfile,
  noticeDays,
  searchUrl,
} from './naukri.mapper.js';

describe('searchUrl', () => {
  it('builds the path Naukri keeps filters for', () => {
    expect(
      searchUrl('Java Full Stack Developer', 'Bangalore', {
        minExpYears: 4,
        postedWithinDays: 3,
      }),
    ).toBe(
      'https://www.naukri.com/java-full-stack-developer-jobs-in-bangalore?k=Java+Full+Stack+Developer&l=Bangalore&experience=4&jobAge=3',
    );
  });

  it('leaves out filters that are not set', () => {
    expect(searchUrl('java', 'pune', {})).toBe(
      'https://www.naukri.com/java-jobs-in-pune?k=java&l=pune',
    );
  });
});

// Trimmed copies of real responses (12 Nov 2026).
const listing = {
  title: 'Java Full stack - Pan India',
  jobId: '141125032257',
  companyName: 'Infosys',
  tagsAndSkills: 'Java,Spring Boot,React.Js',
  placeholders: [
    { type: 'experience', label: '4-9 Yrs' },
    { type: 'salary', label: '6-16 Lacs PA' },
    { type: 'location', label: 'Hyderabad, Pune, Bengaluru' },
  ],
  jdURL: '/job-listings-java-full-stack-pan-india-infosys-141125032257',
  jobDescription: '<p>Hiring Java Full Stack Developer</p>',
  createdDate: 1794484946879,
  minimumExperience: '4',
  maximumExperience: '9',
};

describe('fromListings', () => {
  it('maps a search result', () => {
    expect(fromListings({ noOfJobs: 1, jobDetails: [listing] })).toEqual([
      {
        externalId: '141125032257',
        title: 'Java Full stack - Pan India',
        company: 'Infosys',
        location: 'Hyderabad, Pune, Bengaluru',
        minExpYears: 4,
        maxExpYears: 9,
        salaryText: '6-16 Lacs PA',
        skills: ['Java', 'Spring Boot', 'React.Js'],
        description: '<p>Hiring Java Full Stack Developer</p>',
        url: 'https://www.naukri.com/job-listings-java-full-stack-pan-india-infosys-141125032257',
        postedAt: new Date(1794484946879),
        raw: listing,
      },
    ]);
  });

  it('hides an undisclosed salary and copes with no skills (recommended jobs)', () => {
    const [job] = fromListings({
      jobDetails: [
        {
          ...listing,
          tagsAndSkills: undefined,
          placeholders: [{ type: 'salary', label: 'Not disclosed' }],
        },
      ],
    });
    expect(job?.salaryText).toBeUndefined();
    expect(job?.location).toBeUndefined();
    expect(job?.skills).toEqual([]);
  });

  it('returns nothing when the search has no jobs', () => {
    expect(fromListings({ noOfJobs: 0 })).toEqual([]);
  });

  it('rejects a response that is not a job list', () => {
    expect(() => fromListings({ jobDetails: [{ title: 'x' }] })).toThrow();
  });
});

describe('fromProfile', () => {
  it('maps the Naukri profile to our Profile fields', () => {
    const employments = [{ designation: 'Senior Engineer' }];
    const profile = fromProfile({
      user: { email: 'a@example.com', mobile: '9000000000' },
      itskills: [
        { skill: 'Angular' },
        { skill: 'Kafka', experienceTime: { year: 3, month: 0 } },
      ],
      employments,
      profile: [
        {
          name: 'Asha Rao',
          keySkills: 'java,angular, Spring Boot',
          resumeHeadline: 'Java full stack developer',
          summary: 'Summary text',
          experience: { year: '4', month: '6' },
          city: { value: 'Gurugram' },
          newLocationPrefId: [{ value: 'Remote' }, { value: 'Bangalore/Bengaluru' }],
          desiredRole: [{ value: 'Java Developer' }],
          absoluteCtc: '1250000',
          absoluteExpectedCtc: '1800000',
          noticePeriod: { id: 2, value: '1 Month' },
        },
      ],
    });
    expect(profile).toEqual({
      fullName: 'Asha Rao',
      email: 'a@example.com',
      phone: '9000000000',
      headline: 'Java full stack developer',
      totalExpMonths: 54,
      skills: ['java', 'Angular', 'Spring Boot', 'Kafka'],
      currentLocation: 'Gurugram',
      preferredCities: ['Remote', 'Bangalore/Bengaluru'],
      currentCtcLpa: 12.5,
      expectedCtcLpa: 18,
      noticePeriodDays: 30,
      resumeData: {
        summary: 'Summary text',
        keySkills: ['java', 'angular', 'Spring Boot'],
        skillYears: { Kafka: 3 },
        desiredRoles: ['Java Developer'],
        employments,
        projects: [],
        educations: [],
      },
    });
  });

  it('reads the notice period wording', () => {
    expect(noticeDays('15 Days or less')).toBe(15);
    expect(noticeDays('More than 3 Months')).toBe(90);
    expect(noticeDays('Serving Notice Period')).toBeUndefined();
  });
});

describe('fromPerformance', () => {
  it('reads single days and date ranges, oldest first, keywords most searched first', () => {
    const performance = fromPerformance({
      totalSearchAppearances: 885,
      dayWiseSearchAppearance: 565,
      percentageChange: -70,
      searchAppearanceTimeline: {
        '2026-11-11 - 2026-11-04': 204,
        '2026-11-12': 7,
        '2026-10-26 - 2026-10-20': 44,
      },
      searchKeyWords: { React: 26, Java: 43 },
    });
    expect(performance).toEqual({
      totalAppearances: 885,
      inWindow: 565,
      changePercent: -70,
      recruiterActions: 0,
      buckets: [
        { from: '2026-10-20', to: '2026-10-26', appearances: 44 },
        { from: '2026-11-04', to: '2026-11-11', appearances: 204 },
        { from: '2026-11-12', to: '2026-11-12', appearances: 7 },
      ],
      keywords: [
        { keyword: 'Java', searches: 43 },
        { keyword: 'React', searches: 26 },
      ],
    });
  });
});

describe('fromPosting', () => {
  it('maps a full posting', () => {
    const body = {
      jobDetails: {
        jobId: '141125032257',
        title: 'Java Full stack - Pan India',
        companyDetail: { name: 'Infosys' },
        locations: [{ label: 'Hyderabad' }, { label: 'Bengaluru' }],
        minimumExperience: 4,
        maximumExperience: 9,
        salaryDetail: { salaryText: '6-16 Lacs P.A.' },
        keySkills: {
          preferred: [{ label: 'Java' }],
          other: [{ label: 'Spring Boot' }],
        },
        description: '<p>Full text</p>',
        staticUrl: 'https://www.naukri.com/job-listings-x-141125032257',
        createdDate: '2026-11-12 17:32:26',
      },
    };
    expect(fromPosting(body)).toEqual({
      externalId: '141125032257',
      title: 'Java Full stack - Pan India',
      company: 'Infosys',
      location: 'Hyderabad, Bengaluru',
      minExpYears: 4,
      maxExpYears: 9,
      salaryText: '6-16 Lacs P.A.',
      skills: ['Java', 'Spring Boot'],
      description: '<p>Full text</p>',
      url: 'https://www.naukri.com/job-listings-x-141125032257',
      postedAt: new Date('2026-11-12T12:02:26Z'),
      raw: body,
    });
  });
});
