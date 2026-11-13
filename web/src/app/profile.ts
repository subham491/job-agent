import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Api, day, errorText, type Boost, type Bucket, type Day, type Keyword, type RefreshResult, type Report } from './api';
import { Chart } from './chart';
import { Store } from './store';

type Tab = 'report' | 'routine' | 'boost';
type Period = '7' | '30' | '90' | 'all';
interface Saved<T> { at: string; data: T }

/** Results that take a Chrome session to produce are kept between visits, so the screen is never empty after the first read. */
function remembered<T>(key: string): Saved<T> | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as Saved<T> | null;
  } catch {
    return null;
  }
}
function remember<T>(key: string, data: T): Saved<T> {
  const saved = { at: new Date().toISOString(), data };
  try {
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    /* private window: the result still shows for this visit */
  }
  return saved;
}

@Component({
  selector: 'app-profile',
  imports: [NgTemplateOutlet, Chart],
  template: `
    <div class="seg" role="group" aria-label="Profile sections">
      <button type="button" [attr.aria-pressed]="tab() === 'report'" (click)="tab.set('report')">Report</button>
      <button type="button" [attr.aria-pressed]="tab() === 'routine'" (click)="tab.set('routine')">Daily routine</button>
      <button type="button" [attr.aria-pressed]="tab() === 'boost'" (click)="tab.set('boost')">Profile boost</button>
    </div>

    @switch (tab()) {
      @case ('report') {
        <p class="note">How recruiters are finding the profile, read from Naukri's performance page. The report only reads; it changes nothing on Naukri.</p>
        <div class="row">
          <div class="seg" role="group" aria-label="Period">
            @for (p of periods; track p.id) {
              <button type="button" [attr.aria-pressed]="period() === p.id" (click)="period.set(p.id)">{{ p.label }}</button>
            }
          </div>
          <span class="top-space"></span>
          @if (report(); as saved) { <span class="note">Read {{ when(saved.at) }}</span> }
          <button type="button" class="btn" [disabled]="reading()" (click)="readReport()">{{ reading() ? 'Reading from Naukri…' : report() ? 'Read again' : 'Read from Naukri' }}</button>
        </div>
        @if (reportError()) { <p class="empty">{{ reportError() }}</p> }

        @if (period() === 'all') {
          <dl class="tiles">
            <div class="tile panel"><dd class="num">{{ report()?.data?.performance?.inWindow ?? '–' }}</dd><dt>Search appearances Naukri still holds, 90 days</dt></div>
            <div class="tile panel"><dd class="num">{{ record().length }}</dd><dt>Days in the agent's own record</dt></div>
            <div class="tile panel"><dd class="num">{{ record().length ? day(record()[0].date) : '–' }}</dd><dt>Record starts</dt></div>
          </dl>
          <p class="note">Naukri keeps 90 days and nothing older. To go further back the agent saves one figure a day, so this view grows as the daily routine runs.</p>
          @if (report(); as saved) { <app-chart title="By month, from Naukri" [buckets]="saved.data.performance.buckets" /> }
          <app-chart title="By day, the agent's record" [buckets]="recordBuckets()" />
          <div class="table-wrap">
            <table>
              <thead><tr><th>Day</th><th class="r">Search appearances</th><th>Daily routine</th></tr></thead>
              <tbody>
                @for (d of record(); track d.date) {
                  <tr>
                    <td>{{ day(d.date) }}</td>
                    <td class="r num">{{ d.appearances ?? 'Not reported yet' }}</td>
                    <td>@if (d.refreshedAt) { <span class="tag is-up">Ran</span> {{ d.note }} } @else { <span class="tag">Not run</span> {{ d.note }} }</td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="note">No days recorded yet. Run the daily routine once to start the record.</td></tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (report(); as saved) {
          <dl class="tiles">
            <div class="tile panel"><dd class="num">{{ saved.data.performance.inWindow }}</dd><dt>Search appearances, last {{ period() }} days</dt></div>
            <div class="tile panel"><dd class="num">{{ saved.data.performance.changePercent }}%</dd><dt>Change on the {{ period() }} days before</dt></div>
            <div class="tile panel"><dd class="num">{{ saved.data.performance.keywords.length }}</dd><dt>Different keywords searched</dt></div>
          </dl>
          <app-chart [title]="'Search appearances ' + (period() === '7' ? 'by day' : period() === '30' ? 'by week' : 'by month')" [buckets]="saved.data.performance.buckets" />
          @if (saved.data.headlineMissing.length) {
            <p class="note">Most searched and not in the headline in that wording: {{ saved.data.headlineMissing.join(', ') }}.</p>
          }
          <div class="two">
            <div class="stack">
              <h2>Searched and on the profile</h2>
              <p class="note">Already in the key skills or headline, word for word.</p>
              <ng-container *ngTemplateOutlet="keywords; context: { list: saved.data.advice.covered, why: false }" />
            </div>
            <div class="stack">
              <h2>Searched, but only if true</h2>
              <p class="note">Nothing on the profile backs these, so the agent never adds them by itself.</p>
              <ng-container *ngTemplateOutlet="keywords; context: { list: saved.data.advice.unproven, why: false }" />
            </div>
          </div>
          <div class="stack">
            <h2>Searched in another wording</h2>
            <p class="note">The profile already backs each of these.</p>
            <ng-container *ngTemplateOutlet="keywords; context: { list: saved.data.advice.add, why: true }" />
          </div>
        } @else if (!reading()) {
          <p class="empty">Not read yet for this period. Press Read from Naukri; Chrome opens for about 20 seconds.</p>
        }
      }

      @case ('routine') {
        <p class="note">What the agent does on Naukri once a day to keep the profile near the top of recruiter searches. It adds and removes nothing.</p>
        <div class="panel run">
          <div class="stack grow">
            @if (lastRun(); as run) {
              <h2>Last run: {{ day(run.date) }}</h2>
              <p class="note">{{ run.note }}</p>
            } @else {
              <h2>Not run yet</h2>
              <p class="note">The first run reorders the key skills, so it takes about two minutes.</p>
            }
          </div>
          <button type="button" class="btn btn--primary" [disabled]="running()" (click)="runRoutine()">{{ running() ? 'Running on Naukri…' : 'Run daily routine now' }}</button>
        </div>
        @if (routineError()) { <p class="empty">{{ routineError() }}</p> }
        <div class="two">
          <div class="stack">
            <h2>What it does</h2>
            <ol class="steps">
              <li [class.is-done]="running() || !!result()"><p>Logs in, which counts as being active, and records the day's search appearances.</p></li>
              <li [class.is-done]="!!result()"><p>Puts the key skills recruiters searched most at the front.</p></li>
              <li [class.is-done]="!!result()"><p>Saves the key skills. Naukri then shows the profile as modified today, even when nothing changed.</p></li>
            </ol>
            <p class="note">To run it by itself once a day, add NAUKRI_REFRESH_CRON to .env. If Naukri asks for a login code or a CAPTCHA it stops and waits for you.</p>
          </div>
          <div class="stack">
            <h2>Why this should help</h2>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Lever</th><th>How sure</th></tr></thead>
                <tbody>
                  <tr><td><b>Freshness.</b> Saves the profile and logs in every day.</td><td>Naukri's recruiter help says recruiters can sort results by CV freshness and last active date. How much it lifts a profile is not published.</td></tr>
                  <tr><td><b>Skill order.</b> Most searched skills first.</td><td>Naukri's own advice to job seekers. The effect on ranking is not published.</td></tr>
                  <tr><td><b>Proof.</b> Records appearances every day.</td><td>Measured from her own numbers. Compare the days before and after the routine started.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        @if (result(); as r) {
          <div class="stack">
            <h2>Key skills order after this run</h2>
            <ol class="chips">
              @for (s of r.keySkills; track s) { <li class="chip" [class.is-up]="r.movedUp.includes(s)"><span class="num">{{ $index + 1 }}</span> {{ s }}</li> }
            </ol>
            <p class="note">{{ r.movedUp.length ? 'Outlined in orange: moved up in this run.' : 'The order was already right, so it was saved unchanged.' }}</p>
          </div>
        }
      }

      @case ('boost') {
        <p class="note">Claude reads the whole profile and 90 days of recruiter searches, then proposes a new headline and key skills list. Nothing on Naukri changes until you press Apply.</p>
        <div class="row">
          @if (boost(); as saved) { <span class="note">Proposed {{ when(saved.at) }}</span> }
          <span class="top-space"></span>
          <button type="button" class="btn" [disabled]="proposing() || !store.settings().aiEnabled" (click)="propose()">{{ proposing() ? 'Reading Naukri and asking Claude…' : boost() ? 'Propose again' : 'Propose a boost' }}</button>
        </div>
        @if (!store.settings().aiEnabled) { <p class="empty">Profile boost needs the AI key. Add ANTHROPIC_API_KEY to .env and restart the app.</p> }
        @if (boostError()) { <p class="empty">{{ boostError() }}</p> }
        @if (boost(); as saved) {
          <div class="stack">
            <h2>Headline</h2>
            <div class="two">
              <div class="panel text-card"><p class="label">Now, {{ saved.data.current.headline.length }} of 250 characters</p><p>{{ saved.data.current.headline }}</p></div>
              <div class="panel text-card is-new">
                <label class="label" for="boost-headline">Proposed, {{ headline().length }} of 250 characters. You can edit it.</label>
                <textarea id="boost-headline" class="field area" rows="5" maxlength="250" [value]="headline()" (input)="headline.set($any($event.target).value)"></textarea>
              </div>
            </div>
            <p class="note"><b>Why.</b> {{ saved.data.why.headline }}</p>
          </div>
          <div class="stack">
            <h2>Key skills</h2>
            <div class="two">
              <div class="panel text-card"><p class="label">Now, {{ saved.data.current.keySkills.length }} skills</p><p>{{ saved.data.current.keySkills.join(', ') }}</p></div>
              <div class="panel text-card is-new">
                <label class="label" for="boost-skills">Proposed, {{ skillList().length }} skills, {{ skillList().join(',').length }} of 250 characters. Separate with commas; you can edit it.</label>
                <textarea id="boost-skills" class="field area" rows="6" [value]="skills()" (input)="skills.set($any($event.target).value)"></textarea>
              </div>
            </div>
            <div class="two">
              <div class="stack"><p class="label">Added</p><ul class="chips">@for (s of saved.data.proposed.added; track s) { <li class="chip is-up">{{ s }}</li> } @empty { <li class="note">Nothing added.</li> }</ul></div>
              <div class="stack"><p class="label">Dropped to make room</p><ul class="chips">@for (s of saved.data.proposed.dropped; track s) { <li class="chip is-missing">{{ s }}</li> } @empty { <li class="note">Nothing dropped.</li> }</ul></div>
            </div>
            <p class="note"><b>Why.</b> {{ saved.data.why.keySkills }}</p>
            <p class="note"><b>Checked by the app.</b> {{ saved.data.proposed.rejected.length ? 'Thrown out: ' + saved.data.proposed.rejected.join('; ') + '.' : 'Every added skill is already backed by the profile, and both fields fit Naukri’s limits.' }}</p>
          </div>
          <div class="panel run">
            <div class="stack grow">
              <h2>Apply this to Naukri</h2>
              <p class="note">Writes the headline and key skills above to the live profile, then reads them back to confirm. This changes what recruiters see.</p>
              @if (skillList().join(',').length > 250) { <p class="note warn">The key skills are {{ skillList().join(',').length }} characters. Naukri allows 250; remove some first.</p> }
            </div>
            <button type="button" class="btn btn--primary" [disabled]="applying() || skillList().join(',').length > 250 || !headline().trim()" (click)="applyBoost()">{{ applying() ? 'Saving on Naukri…' : 'Apply to Naukri' }}</button>
          </div>
        }
      }
    }

    <ng-template #keywords let-list="list" let-why="why">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Keyword</th><th class="r">Searches</th>@if (why) { <th>Where the profile backs it</th> }</tr></thead>
          <tbody>
            @for (k of top(list); track k.keyword) {
              <tr><td>{{ k.keyword }}</td><td class="r num">{{ k.searches }}</td>@if (why) { <td>{{ k.evidence }}</td> }</tr>
            } @empty {
              <tr><td colspan="3" class="note">None in this period.</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (list.length > 12) { <p class="note">{{ list.length - 12 }} more, searched less often.</p> }
    </ng-template>
  `,
})
export class Profile {
  private readonly api = inject(Api);
  protected readonly store = inject(Store);
  protected readonly day = day;
  protected readonly periods: { id: Period; label: string }[] = [
    { id: '7', label: 'Last 7 days' },
    { id: '30', label: 'Last 30 days' },
    { id: '90', label: 'Last 90 days' },
    { id: 'all', label: 'All time' },
  ];
  protected readonly tab = signal<Tab>('report');

  // Report
  protected readonly period = signal<Period>('7');
  private readonly reports = signal<Record<string, Saved<Report> | null>>({
    '7': remembered('report-7'),
    '30': remembered('report-30'),
    '90': remembered('report-90'),
  });
  protected readonly report = computed(() => this.reports()[this.period() === 'all' ? '90' : this.period()] ?? null);
  protected readonly reading = signal(false);
  protected readonly reportError = signal('');
  protected readonly record = signal<Day[]>([]);
  protected readonly recordBuckets = computed<Bucket[]>(() =>
    this.record()
      .filter((d) => d.appearances !== null)
      .map((d) => ({ from: d.date.slice(0, 10), to: d.date.slice(0, 10), appearances: d.appearances! })),
  );

  // Daily routine
  protected readonly running = signal(false);
  protected readonly routineError = signal('');
  protected readonly result = signal<RefreshResult | null>(null);
  protected readonly lastRun = computed(() => [...this.record()].reverse().find((d) => d.refreshedAt) ?? null);

  // Profile boost
  protected readonly boost = signal<Saved<Boost> | null>(remembered('boost'));
  protected readonly proposing = signal(false);
  protected readonly applying = signal(false);
  protected readonly boostError = signal('');
  protected readonly headline = signal(this.boost()?.data.proposed.headline ?? '');
  protected readonly skills = signal(this.boost()?.data.proposed.keySkills.join(', ') ?? '');
  protected readonly skillList = computed(() => this.skills().split(',').map((s) => s.trim()).filter(Boolean));

  constructor() {
    void this.loadRecord();
  }

  protected top(list: Keyword[]): Keyword[] {
    return list.slice(0, 12);
  }
  protected when(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  private async loadRecord(): Promise<void> {
    try {
      // The server sends newest first; the screens read oldest first.
      this.record.set((await this.api.visibility()).reverse());
    } catch {
      /* the routine and all-time views show their own empty state */
    }
  }

  protected async readReport(): Promise<void> {
    const days = this.period() === 'all' ? '90' : this.period();
    this.reading.set(true);
    this.reportError.set('');
    try {
      const saved = remember(`report-${days}`, await this.api.report(Number(days)));
      this.reports.update((all) => ({ ...all, [days]: saved }));
    } catch (error) {
      this.reportError.set(errorText(error));
    } finally {
      this.reading.set(false);
    }
  }
  protected async runRoutine(): Promise<void> {
    this.running.set(true);
    this.routineError.set('');
    this.result.set(null);
    try {
      const result = await this.api.runRoutine();
      this.result.set(result);
      this.store.toast(result.movedUp.length ? `Daily routine done. ${result.movedUp.length} skills moved up.` : 'Daily routine done. Saved unchanged to stay fresh.');
      await this.loadRecord();
    } catch (error) {
      this.routineError.set(errorText(error));
    } finally {
      this.running.set(false);
    }
  }
  protected async propose(): Promise<void> {
    this.proposing.set(true);
    this.boostError.set('');
    try {
      const saved = remember('boost', await this.api.proposeBoost());
      this.boost.set(saved);
      this.headline.set(saved.data.proposed.headline);
      this.skills.set(saved.data.proposed.keySkills.join(', '));
    } catch (error) {
      this.boostError.set(errorText(error));
    } finally {
      this.proposing.set(false);
    }
  }
  protected async applyBoost(): Promise<void> {
    this.applying.set(true);
    this.boostError.set('');
    try {
      const stored = await this.api.applyBoost(this.headline().trim(), this.skillList());
      this.store.toast(`Saved on Naukri: the headline and ${stored.keySkills.length} key skills.`);
    } catch (error) {
      this.boostError.set(errorText(error));
    } finally {
      this.applying.set(false);
    }
  }
}
