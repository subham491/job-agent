import type { Profile } from '@prisma/client';
import { pickOption, profileAnswer, questionKey } from './answers.js';

const profile = {
  totalExpMonths: 50,
  noticePeriodDays: 30,
  currentLocation: 'Gurugram',
  preferredCities: ['Remote', 'Bangalore/Bengaluru'],
  currentCtcLpa: 12.5,
  expectedCtcLpa: 18,
  resumeData: { skillYears: { 'Spring Boot': 4, Kafka: 3 } },
} as unknown as Profile;
const ask = (question: string, options: string[] = []) =>
  profileAnswer(profile, { question, options });

describe('profileAnswer', () => {
  it('answers what the profile states', () => {
    expect(ask('What is your notice period?')).toBe('30 days');
    expect(ask('What is your current CTC in Lacs per annum?')).toBe('12.5');
    expect(ask('Expected CTC (LPA)?')).toBe('18');
    expect(ask('What is your current location?')).toBe('Gurugram');
    expect(ask('How many years of total experience do you have?')).toBe('4');
    expect(ask('How many years of experience do you have in Spring Boot?')).toBe('4');
    expect(ask('How many years of experience do you have in kafka?')).toBe('3');
  });

  it('picks only from the choices offered', () => {
    expect(
      ask('Please select the city you are currently residing or willing to relocate to', [
        'Hyderabad, Telangana',
        'Bengaluru, Karnataka',
      ]),
    ).toBe('Bengaluru, Karnataka');
    expect(ask('What is your notice period?', ['15 Days or less', '1 Month', '2 Months'])).toBe('1 Month');
    expect(ask('Preferred city?', ['Pune', 'Chennai'])).toBeUndefined();
  });

  it('leaves the rest unanswered instead of guessing', () => {
    // No unit named, so the salary could be read as rupees.
    expect(ask('What is your current CTC?')).toBeUndefined();
    // Not a skill she gives years for.
    expect(ask('How many years of experience do you have in AWS?')).toBeUndefined();
    expect(ask('Are you available for an interview this week?')).toBeUndefined();
    expect(ask('Why do you want this role?')).toBeUndefined();
  });
});

describe('question matching', () => {
  it('ignores case and spacing in questions, and case in choices', () => {
    expect(questionKey('  What is  your Notice Period? ')).toBe('what is your notice period?');
    expect(pickOption(['Yes', 'No'], ' yes')).toBe('Yes');
    expect(pickOption(['Yes', 'No'], 'Maybe')).toBeUndefined();
  });
});
