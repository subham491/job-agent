import { Component, inject } from '@angular/core';
import type { Answer } from './api';
import { Store } from './store';

@Component({
  selector: 'app-answers',
  template: `
    <p class="note">Every recruiter question the agent has an answer for. It reuses these, so the same question is never asked of you twice. Change an answer here and it is used from then on.</p>
    @if (store.answers().length) {
      <div class="panel">
        @for (a of store.answers(); track a.id) {
          <div class="answer-row">
            <label [attr.for]="'a-' + a.id">{{ a.question }}</label>
            <input class="field" [id]="'a-' + a.id" [value]="a.answer" (change)="save(a, $any($event.target).value)" />
            <span class="tag" [class.is-up]="a.source === 'angel'">{{ source(a.source) }}</span>
          </div>
        }
      </div>
      <p class="note">Answers tagged Angel were written by the agent. For facts that are not on the profile it answers truthfully, for example 0 years for a skill she does not list.</p>
    } @else {
      <p class="empty">No answers saved yet. They appear here as the agent applies to jobs that ask questions.</p>
    }
  `,
})
export class Answers {
  protected readonly store = inject(Store);

  protected source(src: string): string {
    return { profile: 'From profile', user: 'You', angel: 'Angel' }[src] ?? src;
  }
  protected save(answer: Answer, text: string): void {
    if (text.trim() && text.trim() !== answer.answer) void this.store.saveAnswer(answer, text.trim());
  }
}
