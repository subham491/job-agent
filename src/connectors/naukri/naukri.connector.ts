import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ApplyQuestion } from '../../apply/answers.js';
import { ConfigService } from '@nestjs/config';
import { Site, type Prisma } from '@prisma/client';
import {
  chromium,
  errors,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';
import {
  NeedsUserError,
  type FoundJob,
  type JobConnector,
  type JobSearchQuery,
} from '../job-connector.js';
import {
  fromListings,
  fromPerformance,
  fromPosting,
  fromProfile,
  NAUKRI_URL,
  type NaukriPerformance,
  searchSlug,
  searchUrl,
} from './naukri.mapper.js';

/** Holds the live Naukri session. Git-ignored. Relative to where the app is started. */
const PROFILE_DIR = '.browser-profiles/naukri';
export type PerformanceWindow = 7 | 30 | 90;

export type ApplyResult =
  | { applied: true; asked: { question: string; answer: string }[] }
  | {
      applied: false;
      asked: { question: string; answer: string }[];
      /** The question nobody could answer. The application is not sent yet. */
      pending: ApplyQuestion;
    };

const EXCLUSIVE = [
  'search',
  'getPosting',
  'recommended',
  'profile',
  'performance',
  'setKeySkills',
  'setHeadline',
  'apply',
] as const;

const SEARCH_API = '/jobapi/v3/search';
const PAGE_SIZE = 20;

/**
 * Naukri's job API refuses plain HTTP calls ("recaptcha required"), so this opens the
 * real pages in Chrome and reads the JSON each page fetches for itself.
 * shortcut: one shared browser tab, so calls must not overlap; give each call its own tab when a scheduler runs them in parallel.
 */
@Injectable()
export class NaukriConnector implements JobConnector, OnModuleDestroy {
  readonly site = Site.NAUKRI;
  private context?: Promise<BrowserContext>;
  private readonly logger = new Logger(NaukriConnector.name);

  private readonly inside = new AsyncLocalStorage<true>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ConfigService) {
    // Every public task shares one browser tab, so each is made to wait its turn (fetch, daily routine and applying can all be asked for at once).
    for (const name of EXCLUSIVE) {
      const task = (this[name] as (...args: unknown[]) => Promise<unknown>).bind(this);
      (this as unknown as Record<string, unknown>)[name] = (...args: unknown[]) =>
        this.exclusive(() => task(...args));
    }
  }

  /** Runs one task at a time. A task that calls another (recommended calls login) runs straight through. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    if (this.inside.getStore()) return task();
    const run = this.tail.then(() => this.inside.run(true, task));
    this.tail = run.catch(() => undefined);
    return run;
  }

  /**
   * Applies to one job. This sends a real application: call it only for a job the user approved.
   * `answer` is asked each recruiter question in turn; when it has no answer the application is
   * left unfinished and the question is returned, and Naukri resumes there next time.
   */
  async apply(
    externalId: string,
    answer: (question: ApplyQuestion) => Promise<string | undefined>,
  ): Promise<ApplyResult> {
    await this.login();
    const page = await this.page();
    await page.waitForTimeout(2_000 + Math.random() * 3_000);
    await page.goto(`${NAUKRI_URL}/job-listings-${externalId}`, {
      waitUntil: 'domcontentloaded',
    });
    const asked: { question: string; answer: string }[] = [];
    const applied = () => /myapply|saveApply/i.test(page.url());
    try {
      // The page has two Apply buttons with the same id (one in a sticky header): use the one on screen.
      const button = page.locator('#apply-button:visible').first();
      const done = page.locator('#already-applied');
      await button.or(done).first().waitFor({ timeout: 20_000 });
      if (await done.count()) return { applied: true, asked };
      await page.waitForTimeout(1_500);
      await button.click();
      const box = page.locator('.chatbot_DrawerContentWrapper').first();
      await Promise.race([
        box.waitFor({ timeout: 15_000 }),
        page.waitForURL(/myapply|saveApply/i, { timeout: 15_000 }),
      ]).catch(() => undefined);
      let last = '';
      while (!applied()) {
        await page.waitForTimeout(2_500);
        if (applied()) break;
        const question = (
          (await box.locator('.botMsg').allTextContents()).at(-1) ?? ''
        ).trim();
        if (!question || question === last || asked.length >= 25) {
          throw new errors.TimeoutError('the question box did not move on');
        }
        const choices = box.locator(
          '.ssrc__label, .mcc__label, [class*="chatbot_Chip"]:not([class*="Container"])',
        );
        const options = (await choices.allTextContents())
          .map((o) => o.trim())
          .filter(Boolean);
        const reply = await answer({ question, options });
        if (reply === undefined) {
          return { applied: false, asked, pending: { question, options } };
        }
        if (options.length) {
          await choices.filter({ hasText: reply }).first().click();
        } else {
          const field = box.locator('.textArea[contenteditable]').first();
          await field.click();
          await field.pressSequentially(reply, { delay: 90 });
        }
        await page.waitForTimeout(800);
        await box.locator('.sendMsg').first().click();
        asked.push({ question, answer: reply });
        last = question;
      }
      return { applied: true, asked };
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        this.logger.warn(`Apply ${externalId}: ${error.message.split('\n')[0]}`);
        throw new NeedsUserError(this.site, 'unknown-screen');
      }
      throw error;
    }
  }

  /** One page load per keyword and city pair, merged by job id. */
  async search(query: JobSearchQuery): Promise<FoundJob[]> {
    const page = await this.page();
    const found = new Map<string, FoundJob>();
    for (const keyword of query.keywords) {
      for (const location of query.locations) {
        let jobs = fromListings(
          await this.capture(page, SEARCH_API, () =>
            page.goto(searchUrl(keyword, location, query), {
              waitUntil: 'domcontentloaded',
            }),
          ),
        );
        for (let next = 2; ; next++) {
          for (const job of jobs) found.set(job.externalId, job);
          // A short page is the last one.
          if (next > (query.maxPages ?? 1) || jobs.length < PAGE_SIZE) break;
          // Later pages only keep the filters when reached through the site's own link.
          const link = page
            .locator(`a[href="/${searchSlug(keyword, location)}-${next}"]`)
            .first();
          // The link is drawn after the results; no link means there is no such page.
          const hasPage = await link.waitFor({ timeout: 10_000 }).then(
            () => true,
            () => false,
          );
          if (!hasPage) break;
          jobs = fromListings(
            await this.capture(page, SEARCH_API, () => link.click()),
          );
        }
      }
    }
    return [...found.values()];
  }

  async getPosting(externalId: string): Promise<FoundJob> {
    const page = await this.page();
    const body = await this.capture(page, `/jobapi/v4/job/${externalId}`, () =>
      page.goto(`${NAUKRI_URL}/job-listings-${externalId}`, {
        waitUntil: 'domcontentloaded',
      }),
    );
    return fromPosting(body);
  }

  /** Jobs Naukri recommends for the logged-in profile. */
  async recommended(): Promise<FoundJob[]> {
    await this.login();
    const page = await this.page();
    const body = await this.capture(page, '/jobapi/v2/search/recom-jobs', () =>
      page.goto(`${NAUKRI_URL}/mnjuser/recommendedjobs`, {
        waitUntil: 'domcontentloaded',
      }),
    );
    return fromListings(body);
  }

  /** The logged-in user's own profile. Read only. */
  async profile(): Promise<Prisma.ProfileCreateInput> {
    await this.login();
    const page = await this.page();
    const body = await this.capture(
      page,
      '/resman-aggregator-services/v2/users/self',
      () =>
        page.goto(`${NAUKRI_URL}/mnjuser/profile`, {
          waitUntil: 'domcontentloaded',
        }),
    );
    return fromProfile(body);
  }

  /**
   * How often recruiters found the profile in the last 7, 30 or 90 days, and the words they searched.
   * 90 days is as far back as Naukri goes. Read only.
   */
  async performance(days: PerformanceWindow = 7): Promise<NaukriPerformance> {
    await this.login();
    const page = await this.page();
    const api = '/profile-performance/v0/jobseeker/self/search-impressions?days=';
    // The page always opens on 7 days; the longer windows come from its own dropdown.
    let body = await this.capture(page, `${api}7`, () =>
      page.goto(`${NAUKRI_URL}/mnjuser/performance`, {
        waitUntil: 'domcontentloaded',
      }),
    );
    if (days !== 7) {
      body = await this.capture(page, `${api}${days}`, async () => {
        await page.locator('.search-appearances-droop-label').click();
        await page
          .locator('li', { hasText: new RegExp(`^\\s*${days} Days\\s*$`) })
          .click();
      });
    }
    return fromPerformance(body);
  }

  /**
   * Replaces the profile's key skills with `next`, through the site's own edit form.
   * This changes the live profile: call it only with a list the user approved.
   * Naukri caps the field at 250 characters in total and stops accepting letters beyond that.
   */
  async setKeySkills(next: string[]): Promise<void> {
    await this.login();
    const page = await this.page();
    await page.goto(`${NAUKRI_URL}/mnjuser/profile`, {
      waitUntil: 'domcontentloaded',
    });
    const input = page.locator('#keySkillSugg');
    const chips = page.locator('form:has(#keySkillSugg) .chipsContainer .chip');
    const shown = async () =>
      (await chips.locator('.tagTxt').allTextContents()).map((s) => s.trim());
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    try {
      await this.openEditor(page, '#lazyKeySkills', input);
      // The form only appends, so order is set by keeping the leading skills that are already
      // right, removing everything after them (last first), and typing the rest in order.
      const current = await shown();
      let keep = 0;
      while (keep < next.length && same(current[keep] ?? '', next[keep]!)) {
        keep++;
      }
      for (const skill of current.slice(keep).reverse()) {
        const chip = chips.filter({
          has: page.getByText(skill, { exact: true }),
        });
        await chip.locator('.close').click();
        // The chip leaves a moment after the click.
        await chip.waitFor({ state: 'detached' });
      }
      for (const skill of next.slice(keep)) {
        await input.fill('');
        // A human pace: the suggestion box rewrites the field when keys arrive faster than its lookups.
        await input.pressSequentially(skill, { delay: 280 });
        await page.waitForTimeout(900);
        // A field that holds anything else (cut short at the 250 limit) fails the check below.
        const held = await input.inputValue();
        if (held !== skill) {
          this.logger.warn(`Key skills field held "${held}" for "${skill}"`);
          break;
        }
        // A comma is what turns the typed text into a chip; Enter only picks a suggestion.
        await input.press(',');
        await chips
          .filter({ has: page.getByText(skill, { exact: true }) })
          .waitFor({ timeout: 5_000 })
          .catch(async () => {
            const now = (await shown()).slice(-2).join(', ');
            throw new errors.TimeoutError(`no chip for "${skill}"; last: ${now}`);
          });
      }
      const final = await shown();
      const matches =
        final.length === next.length &&
        next.every((n, i) => same(final[i]!, n));
      // Never save a list that is not exactly the approved one, in the approved order.
      if (!matches) {
        throw new errors.TimeoutError(
          `form holds ${final.length} skills, expected ${next.length}`,
        );
      }
      const [saved] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/users/self/fullprofiles')),
        page.locator('#saveKeySkills').click(),
      ]);
      if (!saved.ok()) throw new errors.TimeoutError('key skills not saved');
    } catch (error) {
      // The form did not behave as expected: stop and hand over, never force it.
      if (error instanceof errors.TimeoutError) {
        this.logger.warn(`Key skills form: ${error.message.split('\n')[0]}`);
        throw new NeedsUserError(this.site, 'unknown-screen');
      }
      throw error;
    }
  }

  /**
   * Replaces the resume headline through the site's own edit form (250 characters at most).
   * This changes the live profile: call it only with text the user approved.
   */
  async setHeadline(text: string): Promise<void> {
    await this.login();
    const page = await this.page();
    await page.goto(`${NAUKRI_URL}/mnjuser/profile`, {
      waitUntil: 'domcontentloaded',
    });
    const field = page.locator('#resumeHeadlineTxt');
    try {
      await this.openEditor(page, '#lazyResumeHead', field);
      await field.fill(text);
      // The box cuts off anything past its limit: never save a headline that is not the approved one.
      if ((await field.inputValue()) !== text) {
        throw new errors.TimeoutError('headline field did not take the full text');
      }
      const [saved] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/users/self/fullprofiles')),
        page.locator('form[name="resumeHeadlineForm"] button.btn-dark-ot').click(),
      ]);
      if (!saved.ok()) throw new errors.TimeoutError('headline not saved');
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        this.logger.warn(`Headline form: ${error.message.split('\n')[0]}`);
        throw new NeedsUserError(this.site, 'unknown-screen');
      }
      throw error;
    }
  }

  /** Opens a profile section's edit form and waits for `field` to appear. */
  private async openEditor(
    page: Page,
    section: string,
    field: Locator,
  ): Promise<void> {
    const edit = page.locator(`${section} .edit`).first();
    // The pencil is drawn before it is wired up, so an early click can do nothing: click until the form opens.
    for (let attempt = 1; ; attempt++) {
      await edit.click();
      const opened = await field.waitFor({ timeout: 4_000 }).then(
        () => true,
        () => false,
      );
      if (opened) return;
      if (attempt === 3) throw new errors.TimeoutError('edit form did not open');
    }
  }

  /** Does nothing when the saved browser session is still logged in. */
  async login(): Promise<void> {
    const page = await this.page();
    await page.goto(`${NAUKRI_URL}/nlogin/login`, {
      waitUntil: 'domcontentloaded',
    });
    const username = page.locator('#usernameField');
    const formShown = await username.waitFor({ timeout: 5_000 }).then(
      () => true,
      () => false,
    );
    if (formShown) {
      const user = this.config.get<string>('NAUKRI_USERNAME');
      const password = this.config.get<string>('NAUKRI_PASSWORD');
      if (!user || !password) throw new NeedsUserError(this.site, 'login');
      await username.fill(user);
      await page.fill('#passwordField', password);
      await page.click('button[type="submit"]');
    }
    const loggedIn = await page
      .waitForURL((url) => url.pathname.startsWith('/mnjuser/'), {
        timeout: 30_000,
      })
      .then(
        () => true,
        () => false,
      );
    if (!loggedIn) {
      const otp = await page.getByText(/enter (the )?otp/i).count();
      throw new NeedsUserError(this.site, otp ? 'otp' : 'login');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await (await this.context)?.close();
  }

  private async page(): Promise<Page> {
    // A visible Chrome window on purpose: Naukri answers headless browsers with "Access Denied".
    this.context ??= chromium
      .launchPersistentContext(PROFILE_DIR, {
        channel: 'chrome',
        headless: false,
      })
      .then((context) => {
        // The window is on the user's desktop, so they can close it. Forget it then, and open a new one next time.
        context.on('close', () => {
          this.context = undefined;
        });
        return context;
      })
      .catch((error: unknown) => {
        this.context = undefined;
        throw error;
      });
    const context = await this.context;
    return context.pages()[0] ?? (await context.newPage());
  }

  /** Runs a navigation and returns the JSON the page fetched from `apiPath`. */
  private async capture(
    page: Page,
    apiPath: string,
    navigate: () => Promise<unknown>,
  ): Promise<unknown> {
    // Human-like gap before every page load (keep request rates low).
    await page.waitForTimeout(2_000 + Math.random() * 3_000);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(apiPath), {
        timeout: 30_000,
      }),
      navigate(),
    ]).catch((error: unknown) => {
      if (error instanceof errors.TimeoutError) return [];
      throw error;
    });
    if (response?.ok()) return response.json();
    // The page never fetched the data or was refused: hand over to the user, never work around it.
    throw new NeedsUserError(
      this.site,
      page.url().includes('/nlogin')
        ? 'login'
        : response?.status() === 406
          ? 'captcha'
          : 'unknown-screen',
    );
  }
}
