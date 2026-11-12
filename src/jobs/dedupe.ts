import { createHash } from 'node:crypto';

const COMPANY_SUFFIXES =
  /\b(pvt|private|ltd|limited|llp|inc|corp|corporation|technologies|technology|solutions|india)\b/g;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9+#. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseCompany(company: string): string {
  return normalise(company)
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/[. ]+/g, ' ')
    .trim();
}

/** Bangalore and Bengaluru (and similar renamed cities) must compare equal. */
const CITY_ALIASES: Record<string, string> = {
  bangalore: 'bengaluru',
  gurgaon: 'gurugram',
  bombay: 'mumbai',
  madras: 'chennai',
  calcutta: 'kolkata',
};

function normaliseLocation(location?: string): string {
  if (!location) return '';
  const first = normalise(location).split(/[ ,/]/)[0] ?? '';
  return CITY_ALIASES[first] ?? first;
}

/** Same job posted on two sites should produce the same key. */
export function dedupeKey(job: {
  company: string;
  title: string;
  location?: string;
}): string {
  const basis = [
    normaliseCompany(job.company),
    normalise(job.title),
    normaliseLocation(job.location),
  ].join('|');
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}
