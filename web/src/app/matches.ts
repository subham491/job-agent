import { Component, computed, inject, signal } from '@angular/core';
import { day, type Match } from './api';
import { Icon } from './icon';
import { Store } from './store';

const SKILL_GAP = 'Skills not on the profile: ';
const CIRCLE = 2 * Math.PI * 23;

@Component({
  selector: 'app-matches',
  imports: [Icon],
  template: `
    <dl class="tiles">
      <div class="tile panel"><dd class="num">{{ store.summary()?.strong ?? '–' }}</dd><dt>Strong matches, fit 70 or more</dt></div>
      <div class="tile panel"><dd class="num">{{ store.summary()?.scored ?? '–' }}</dd><dt>Jobs scored</dt></div>
      <div class="tile panel"><dd class="num">{{ store.summary()?.applied ?? '–' }}</dd><dt>Applied</dt></div>
      <div class="tile panel"><dd class="num">{{ store.summary()?.needsYou ?? '–' }}</dd><dt>Waiting on you</dt></div>
    </dl>

    <div class="row">
      <label class="search">
        <span class="visually-hidden">Search jobs</span>
        <app-icon name="search" [size]="16" />
        <input class="field" type="search" placeholder="Search title, company, city or skill" [value]="q()" (input)="q.set($any($event.target).value)" />
      </label>
      <div class="seg" role="group" aria-label="Which matches to show">
        <button type="button" [attr.aria-pressed]="strongOnly()" (click)="strongOnly.set(true)">Strong</button>
        <button type="button" [attr.aria-pressed]="!strongOnly()" (click)="strongOnly.set(false)">All</button>
      </div>
      <label>
        <span class="visually-hidden">Posted within</span>
        <select class="field" (change)="store.setDays(+$any($event.target).value)">
          @for (d of [1, 3, 7, 30]; track d) {
            <option [value]="d" [selected]="store.days() === d">Posted in the last {{ d === 1 ? 'day' : d + ' days' }}</option>
          }
        </select>
      </label>
      <label>
        <span class="visually-hidden">Sort</span>
        <select class="field" (change)="sort.set($any($event.target).value)">
          <option value="fit">Best fit first</option>
          <option value="new">Newest first</option>
        </select>
      </label>
    </div>
    <div class="row">
      <label class="check"><input type="checkbox" [checked]="onePerCompany()" (change)="onePerCompany.set($any($event.target).checked)" /> Best job per company only</label>
      <span class="top-space"></span>
      <span class="note">{{ visible().length }} shown</span>
      <button type="button" class="btn" [disabled]="!ready()" (click)="store.applyTop(5)">Apply to top {{ ready() < 5 ? ready() : 5 }}</button>
    </div>

    @switch (store.matchesLoad()) {
      @case ('loading') {
        <div class="jobs" aria-busy="true">@for (i of [1, 2, 3, 4]; track i) { <div class="job panel skeleton"></div> }</div>
      }
      @case ('error') {
        <p class="empty">The job list could not be loaded. Check the app is running, then <button type="button" class="link" (click)="store.loadMatches()">try again</button>.</p>
      }
      @default {
        <div class="jobs">
          @for (m of visible(); track m.id) {
            <article class="job panel">
              <div class="job-top">
                <span class="ring" [class.is-strong]="m.score >= 70" role="img" [attr.aria-label]="'Fit ' + m.score + ' out of 100'">
                  <svg width="56" height="56" viewBox="0 0 56 56">
                    <circle class="track" cx="28" cy="28" r="23" />
                    <circle class="fill" cx="28" cy="28" r="23" [attr.stroke-dasharray]="circle" [attr.stroke-dashoffset]="circle * (1 - m.score / 100)" />
                  </svg>
                  <b>{{ m.score }}</b>
                </span>
                <div class="job-main">
                  <span class="job-title">{{ m.job.title }}</span>
                  <span class="job-co">{{ m.job.company }}</span>
                  <div class="meta">
                    @if (m.job.location) { <span>{{ m.job.location }}</span> }
                    @if (m.job.minExpYears !== null) { <span>{{ m.job.minExpYears }} to {{ m.job.maxExpYears }} years</span> }
                    <span>{{ m.job.salaryText || 'Salary not disclosed' }}</span>
                    @if (m.job.postedAt) { <span>Posted {{ day(m.job.postedAt) }}</span> }
                  </div>
                  @if (m.job.skills.length) {
                    <div class="skillbar">
                      <span class="track"><span [style.transform]="'scaleX(' + have(m) / m.job.skills.length + ')'"></span></span>
                      <span>{{ have(m) }} of {{ m.job.skills.length }} listed skills on the profile</span>
                    </div>
                  }
                </div>
                <div class="job-side">
                  <div class="row">
                    @switch (m.application?.status) {
                      @case ('APPROVED') { <span class="pill is-busy"><app-icon name="spin" [size]="14" />Applying</span> }
                      @case ('NEEDS_USER') {
                        <span class="pill is-odd">Needs you</span>
                        <button type="button" class="btn btn--primary" (click)="store.view.set('board')">Answer on the Board</button>
                      }
                      @case ('APPLIED') { <span class="pill is-line"><app-icon name="check" [size]="14" />Applied</span> }
                      @default {
                        @if (m.job.companySite) {
                          <a class="btn" [href]="m.job.url" target="_blank" rel="noopener">Apply on company site</a>
                        } @else {
                          <button type="button" class="btn btn--primary" (click)="store.apply(m.job.id, m.job.title + ' at ' + m.job.company)">Apply</button>
                        }
                      }
                    }
                  </div>
                  <div class="job-icons">
                    @if (!m.application || m.application.status === 'SHORTLISTED') {
                      <button type="button" class="icon-btn" [attr.aria-pressed]="m.application?.status === 'SHORTLISTED'" aria-label="Shortlist" title="Shortlist" (click)="store.shortlist(m)">
                        <app-icon [name]="m.application?.status === 'SHORTLISTED' ? 'starOn' : 'star'" />
                      </button>
                      <button type="button" class="icon-btn" aria-label="Not for me" title="Not for me" (click)="store.dismiss(m)"><app-icon name="x" /></button>
                    }
                    <button type="button" class="icon-btn" [attr.aria-expanded]="open().has(m.id)" aria-label="Details" title="Details" [style.transform]="open().has(m.id) ? 'rotate(180deg)' : ''" (click)="toggle(m.id)">
                      <app-icon name="down" />
                    </button>
                  </div>
                </div>
              </div>
              @if (open().has(m.id)) {
                <div class="job-more">
                  <div class="stack">
                    <p class="label">Skills the job lists</p>
                    @if (m.job.skills.length) {
                      <ul class="chips">@for (s of m.job.skills; track s) { <li class="chip" [class.is-missing]="missing(m).includes(s)">{{ s }}</li> }</ul>
                      <p class="note">Dashed skills are not on the profile.</p>
                    } @else {
                      <p class="note">This posting lists no skills. The fit is judged from its text.</p>
                    }
                  </div>
                  <div class="stack">
                    <p class="label">Why it fits</p>
                    <ul class="ticks">@for (r of m.reasons; track r) { <li><app-icon name="check" [size]="14" /><span>{{ r }}</span></li> }</ul>
                    <p class="label">Gaps</p>
                    @if (m.gaps.length) {
                      <ul class="ticks is-gap">@for (g of m.gaps; track g) { <li><app-icon name="dash" [size]="14" /><span>{{ g }}</span></li> }</ul>
                    } @else {
                      <p class="note">None found.</p>
                    }
                    <a class="link" [href]="m.job.url" target="_blank" rel="noopener">Open the posting on Naukri</a>
                  </div>
                </div>
              }
            </article>
          } @empty {
            <p class="empty">
              @if (store.matches().length) { No jobs match. Clear the search, switch to All, or widen the posted date. }
              @else { No jobs yet. Press Fetch new jobs at the top to search Naukri. }
            </p>
          }
        </div>
      }
    }
  `,
})
export class Matches {
  protected readonly store = inject(Store);
  protected readonly day = day;
  protected readonly circle = CIRCLE;
  protected readonly q = signal('');
  protected readonly strongOnly = signal(true);
  protected readonly sort = signal<'fit' | 'new'>('fit');
  protected readonly onePerCompany = signal(true);
  protected readonly open = signal(new Set<string>());

  protected readonly visible = computed(() => {
    const q = this.q().trim().toLowerCase();
    const seen = new Set<string>();
    // The server sends best fit first, so the first job met for a company is its best one.
    const list = this.store.matches().filter((m) => {
      if (this.strongOnly() && m.score < 70) return false;
      if (q && !`${m.job.title} ${m.job.company} ${m.job.location ?? ''} ${m.job.skills.join(' ')}`.toLowerCase().includes(q)) return false;
      if (!this.onePerCompany()) return true;
      const company = m.job.company.toLowerCase();
      // A job already acted on always shows, and stands for its company.
      const show = !!m.application || !seen.has(company);
      seen.add(company);
      return show;
    });
    const posted = (m: Match) => (m.job.postedAt ? Date.parse(m.job.postedAt) : 0);
    return this.sort() === 'new' ? [...list].sort((a, b) => posted(b) - posted(a)) : list;
  });
  protected readonly ready = computed(
    () => this.visible().filter((m) => (!m.application || m.application.status === 'SHORTLISTED') && !m.job.companySite && m.score >= 70).length,
  );

  protected missing(m: Match): string[] {
    return m.gaps.filter((g) => g.startsWith(SKILL_GAP)).flatMap((g) => g.slice(SKILL_GAP.length).split(', '));
  }
  protected have(m: Match): number {
    return m.job.skills.length - this.missing(m).length;
  }
  protected toggle(id: string): void {
    this.open.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
}
