import { Component, computed, inject } from '@angular/core';
import { day, type AppStatus, type Application } from './api';
import { Store } from './store';

const LANES: { status: AppStatus; title: string; empty: string }[] = [
  { status: 'SHORTLISTED', title: 'Shortlisted', empty: 'Star a job in Matches to keep it here.' },
  { status: 'APPROVED', title: 'Applying', empty: 'Jobs the agent is working on right now.' },
  { status: 'NEEDS_USER', title: 'Needs you', empty: 'Questions the agent could not answer land here.' },
  { status: 'APPLIED', title: 'Applied', empty: 'Nothing applied to yet.' },
  { status: 'INTERVIEW', title: 'Interview', empty: 'Interviews will come from recruiter emails.' },
  { status: 'OFFER', title: 'Offer', empty: 'Offers will show here.' },
];

@Component({
  selector: 'app-board',
  template: `
    <p class="note">Every application and where it stands. Each card in Applied lists the questions the recruiter asked and the answers that were sent.</p>
    @if (store.boardLoad() === 'error') {
      <p class="empty">The Board could not be loaded. Check the app is running, then <button type="button" class="link" (click)="store.loadBoard()">try again</button>.</p>
    } @else {
      <div class="board" [attr.aria-busy]="store.boardLoad() === 'loading'">
        @for (lane of lanes(); track lane.status) {
          <section class="lane" [class.is-hot]="lane.status === 'NEEDS_USER' && lane.items.length" [attr.aria-label]="lane.title">
            <div class="lane-head">
              <h3>{{ lane.title }}</h3>
              <span class="nav-count" [class.is-hot]="lane.status === 'NEEDS_USER' && lane.items.length">{{ lane.items.length }}</span>
            </div>
            <ul class="stack">
              @for (a of lane.items; track a.id) {
                <li class="card">
                  <div class="card-head">
                    @if (store.scoreByJob().get(a.job.id); as score) {
                      <span class="mini" [class.is-strong]="score >= 70">{{ score }}</span>
                    } @else {
                      <span class="mini">–</span>
                    }
                    <span>
                      <b>{{ a.job.title }}</b><br />
                      <span class="note">{{ a.job.company }}@if (a.appliedAt) {, {{ day(a.appliedAt) }}}</span>
                    </span>
                  </div>
                  @if (a.answers?.qa?.length) {
                    <dl class="qa">
                      @for (x of a.answers!.qa!; track x.q) {
                        <div>
                          <dt>{{ x.q }}</dt>
                          <dd>{{ x.a }} <span class="tag" [class.is-up]="x.src === 'angel'">{{ source(x.src) }}</span></dd>
                        </div>
                      }
                    </dl>
                  }
                  @if (a.status === 'NEEDS_USER') {
                    @if (a.answers?.pending; as pending) {
                      <form class="ask qa" (submit)="answer($event, a, field.value)">
                        <label class="label" [attr.for]="'ans-' + a.id">{{ pending.question }}</label>
                        @if (pending.options.length) {
                          <div class="chips">
                            @for (o of pending.options; track o) {
                              <button type="button" class="btn" (click)="store.answerPending(a, o)">{{ o }}</button>
                            }
                          </div>
                        }
                        <input #field class="field" [id]="'ans-' + a.id" [hidden]="pending.options.length > 0" [required]="!pending.options.length" placeholder="Your answer" />
                        @if (!pending.options.length) { <button type="submit" class="btn btn--primary">Save answer and apply</button> }
                        <p class="note">Your answer is saved, so this question is not asked of you again.</p>
                      </form>
                    } @else {
                      <div class="qa">
                        <p class="note">{{ a.notes || 'The agent stopped before finishing.' }}</p>
                        <button type="button" class="btn" (click)="store.retry(a)">Retry</button>
                      </div>
                    }
                  }
                  @if (a.status === 'SHORTLISTED') {
                    <button type="button" class="btn btn--primary" (click)="store.apply(a.job.id, a.job.title + ' at ' + a.job.company)">Apply</button>
                  }
                  <a class="link" [href]="a.job.url" target="_blank" rel="noopener">Open on Naukri</a>
                </li>
              } @empty {
                <li class="note">{{ lane.empty }}</li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
})
export class Board {
  protected readonly store = inject(Store);
  protected readonly day = day;
  protected readonly lanes = computed(() =>
    LANES.map((lane) => ({ ...lane, items: this.store.applications().filter((a) => a.status === lane.status) })),
  );

  protected source(src: string): string {
    return { profile: 'From profile', user: 'You', angel: 'Angel' }[src] ?? src;
  }
  protected answer(event: Event, application: Application, text: string): void {
    event.preventDefault();
    if (text.trim()) void this.store.answerPending(application, text.trim());
  }
}
