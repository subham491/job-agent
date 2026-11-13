import { Component, input } from '@angular/core';

export type IconName = 'list' | 'board' | 'user' | 'chat' | 'star' | 'starOn' | 'x' | 'check' | 'dash' | 'spin' | 'down' | 'search' | 'wing';

/** The app's small line icons, drawn inline so they take the text colour. */
@Component({
  selector: 'app-icon',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (name()) {
        @case ('list') { <path d="M6 4.5h9M6 9h9M6 13.5h9M2.8 4.5h.01M2.8 9h.01M2.8 13.5h.01" /> }
        @case ('board') { <rect x="2" y="3" width="4" height="12" rx="1.2" /><rect x="7.5" y="3" width="4" height="8" rx="1.2" /><rect x="13" y="3" width="3" height="10" rx="1.2" /> }
        @case ('user') { <circle cx="9" cy="6" r="3" /><path d="M3 15.5c.8-3 3.1-4.5 6-4.5s5.2 1.5 6 4.5" /> }
        @case ('chat') { <path d="M3 4.5h12v8H8.5L5 15.5v-3H3z" /> }
        @case ('star') { <path d="M9 2.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L9 13l-4.2 2.2.8-4.7L2.2 7.2l4.7-.7z" /> }
        @case ('starOn') { <path fill="currentColor" d="M9 2.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L9 13l-4.2 2.2.8-4.7L2.2 7.2l4.7-.7z" /> }
        @case ('x') { <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" /> }
        @case ('check') { <path d="M3.5 9.5l3.5 3.5 7.5-8.5" /> }
        @case ('dash') { <path d="M4 9h10" /> }
        @case ('spin') { <path d="M9 2.5A6.5 6.5 0 1 1 2.5 9" /> }
        @case ('down') { <path d="M4.5 7l4.5 4.5L13.500 7" /> }
        @case ('search') { <circle cx="8" cy="8" r="5" /><path d="M12 12l3.500 3.500" /> }
        @case ('wing') { <path d="M2.5 13.5c5 0 9.5-2.5 13-9-1 6-4 10-9 10.5" /><path d="M5 10.5c2.5-.3 5-1.5 7-3.5" /> }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(18);
}
