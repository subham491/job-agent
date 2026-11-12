import { dedupeKey } from './dedupe.js';

describe('dedupeKey', () => {
  it('matches the same job across sites despite formatting', () => {
    const a = dedupeKey({
      company: 'Acme Technologies Pvt. Ltd.',
      title: 'Senior Java Developer',
      location: 'Bangalore',
    });
    const b = dedupeKey({
      company: 'ACME',
      title: 'senior  java developer',
      location: 'Bengaluru, Karnataka',
    });
    expect(a).toBe(b);
  });

  it('keeps different titles apart', () => {
    const base = { company: 'Acme', location: 'Pune' };
    expect(dedupeKey({ ...base, title: 'Java Developer' })).not.toBe(
      dedupeKey({ ...base, title: 'Angular Developer' }),
    );
  });

  it('keeps different cities apart', () => {
    const base = { company: 'Acme', title: 'Java Developer' };
    expect(dedupeKey({ ...base, location: 'Pune' })).not.toBe(
      dedupeKey({ ...base, location: 'Hyderabad' }),
    );
  });

  it('keeps C++ and C# apart from C', () => {
    const base = { company: 'Acme', location: 'Pune' };
    expect(dedupeKey({ ...base, title: 'C++ Developer' })).not.toBe(
      dedupeKey({ ...base, title: 'C# Developer' }),
    );
  });
});
