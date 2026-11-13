import { Component, computed, input, signal } from '@angular/core';
import { day, type Bucket } from './api';

const span = (b: Bucket): string => (b.from === b.to ? day(b.from) : `${day(b.from)} to ${day(b.to)}`);
const niceMax = (value: number): number => {
  const power = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  return [1, 2, 5, 10].map((m) => m * power).find((x) => x >= value) ?? value;
};

/** Search appearances over time as bars from a zero baseline, with a table view of the same numbers. */
@Component({
  selector: 'app-chart',
  template: `
    <figure class="chart panel">
      <div class="chart-head">
        <h3>{{ title() }}</h3>
        <button type="button" class="link" (click)="asTable.set(!asTable())">{{ asTable() ? 'Show as chart' : 'Show as table' }}</button>
      </div>
      @if (!bars().length) {
        <p class="note">No figures for this period yet.</p>
      } @else if (asTable()) {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Period</th><th class="r">Search appearances</th></tr></thead>
            <tbody>
              @for (bar of bars(); track bar.label) {
                <tr><td>{{ bar.label }}</td><td class="r num">{{ bar.value }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="plot">
          <div class="axis num" aria-hidden="true"><span>{{ top() }}</span><span>0</span></div>
          <div class="cols" role="group" [attr.aria-label]="title()">
            @for (bar of bars(); track bar.label) {
              <div class="col" tabindex="0" [attr.data-tip]="bar.label + ': ' + bar.value + ' appearances'">
                <div class="bar-area">
                  @if (bar.labelled) { <span class="val num" [style.bottom.%]="bar.percent">{{ bar.value }}</span> }
                  <span class="bar" [style.height.%]="bar.percent"></span>
                </div>
                <span class="lbl">{{ bar.label }}</span>
              </div>
            }
          </div>
        </div>
      }
    </figure>
  `,
})
export class Chart {
  readonly title = input.required<string>();
  readonly buckets = input.required<Bucket[]>();
  protected readonly asTable = signal(false);
  protected readonly top = computed(() => niceMax(Math.max(0, ...this.buckets().map((b) => b.appearances)) || 1));
  protected readonly bars = computed(() => {
    const list = this.buckets();
    const max = Math.max(0, ...list.map((b) => b.appearances));
    return list.map((b, i) => ({
      label: span(b),
      value: b.appearances,
      percent: (b.appearances / this.top()) * 100,
      // Only the peak and the latest carry a number; the rest are in the hover tip and the table.
      labelled: b.appearances === max || i === list.length - 1,
    }));
  });
}
