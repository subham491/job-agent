import { Injectable, computed, inject, signal } from '@angular/core';
import { Api, errorText, type Answer, type Application, type Match, type Settings, type Summary } from './api';

export type View = 'matches' | 'board' | 'profile' | 'answers';
export interface Toast { id: number; text: string; undo?: () => void }
type Load = 'loading' | 'ready' | 'error';

/** What every screen shares: the data from the server, and the actions that change it. */
@Injectable({ providedIn: 'root' })
export class Store {
  private readonly api = inject(Api);
  private toastId = 0;

  readonly view = signal<View>('matches');
  readonly matches = signal<Match[]>([]);
  readonly matchesLoad = signal<Load>('loading');
  readonly days = signal(3);
  readonly applications = signal<Application[]>([]);
  readonly boardLoad = signal<Load>('loading');
  readonly answers = signal<Answer[]>([]);
  readonly settings = signal<Settings>({ angelMode: false, aiEnabled: false });
  readonly summary = signal<Summary | null>(null);
  readonly toasts = signal<Toast[]>([]);
  readonly fetching = signal(false);

  readonly needsYou = computed(() => this.applications().filter((a) => a.status === 'NEEDS_USER').length);
  readonly scoreByJob = computed(() => new Map(this.matches().map((m) => [m.job.id, m.score])));

  constructor() {
    void this.loadAll();
    // While the agent is applying, keep the screens in step with it.
    setInterval(() => {
      if (this.applications().some((a) => a.status === 'APPROVED')) void this.loadAll(true);
    }, 4000);
  }

  toast(text: string, undo?: () => void): void {
    const toast = { id: ++this.toastId, text, undo };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dropToast(toast.id), undo ? 7000 : 4500);
  }
  dropToast(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
  private fail = (error: unknown): void => this.toast(errorText(error));

  async loadAll(quiet = false): Promise<void> {
    await Promise.all([this.loadMatches(quiet), this.loadBoard(), this.loadMeta()]);
  }
  async loadMatches(quiet = false): Promise<void> {
    if (!quiet) this.matchesLoad.set('loading');
    try {
      this.matches.set(await this.api.matches(this.days()));
      this.matchesLoad.set('ready');
    } catch {
      this.matchesLoad.set('error');
    }
  }
  async loadBoard(): Promise<void> {
    try {
      this.applications.set(await this.api.applications());
      this.boardLoad.set('ready');
    } catch {
      this.boardLoad.set('error');
    }
  }
  async loadMeta(): Promise<void> {
    try {
      const [summary, settings, answers] = await Promise.all([this.api.summary(), this.api.settings(), this.api.answers()]);
      this.summary.set(summary);
      this.settings.set(settings);
      this.answers.set(answers);
    } catch {
      /* the screens show their own error state from loadMatches */
    }
  }
  setDays(days: number): void {
    this.days.set(days);
    void this.loadMatches();
  }

  async apply(jobId: string, label: string): Promise<void> {
    try {
      await this.api.apply(jobId);
      this.toast(`Queued: ${label}`);
      await this.loadAll(true);
    } catch (error) {
      this.fail(error);
    }
  }
  async applyTop(limit: number): Promise<void> {
    try {
      const { queued } = await this.api.applyTop(limit);
      this.toast(queued ? `Queued ${queued} applications, one per company.` : 'Nothing left to queue today.');
      await this.loadAll(true);
    } catch (error) {
      this.fail(error);
    }
  }
  async shortlist(match: Match): Promise<void> {
    const on = match.application?.status !== 'SHORTLISTED';
    try {
      await this.api.shortlist(match.job.id, on);
      this.toast(on ? 'Shortlisted. It is on the Board.' : 'Removed from the shortlist.');
      await this.loadAll(true);
    } catch (error) {
      this.fail(error);
    }
  }
  async dismiss(match: Match): Promise<void> {
    try {
      await this.api.dismiss(match.id, true);
      this.matches.update((list) => list.filter((m) => m.id !== match.id));
      this.toast(`Removed ${match.job.title} at ${match.job.company}.`, () => {
        void this.api.dismiss(match.id, false).then(() => this.loadMatches(true), this.fail);
      });
    } catch (error) {
      this.fail(error);
    }
  }
  async answerPending(application: Application, answer: string): Promise<void> {
    try {
      await this.api.answerPending(application.id, answer);
      this.toast(`Answer saved. Applying to ${application.job.company}.`);
      await this.loadAll(true);
    } catch (error) {
      this.fail(error);
    }
  }
  async retry(application: Application): Promise<void> {
    try {
      await this.api.retry(application.id);
      this.toast(`Trying ${application.job.company} again.`);
      await this.loadAll(true);
    } catch (error) {
      this.fail(error);
    }
  }
  async setAngel(on: boolean): Promise<void> {
    if (on && !this.settings().aiEnabled) {
      return this.toast('Angel mode needs the AI key. Add ANTHROPIC_API_KEY to .env and restart the app.');
    }
    try {
      this.settings.set(await this.api.saveSettings(on));
      this.toast(on ? 'Angel mode on. The agent will answer recruiter questions itself.' : 'Angel mode off. Unknown questions will wait for you.');
    } catch (error) {
      this.fail(error);
    }
  }
  async fetchJobs(): Promise<void> {
    if (this.fetching()) return;
    this.fetching.set(true);
    this.toast('Fetching from Naukri. Chrome will open; this takes about 90 seconds.');
    try {
      const result = await this.api.fetchJobs();
      this.toast(`Found ${result.found} jobs, ${result.added} of them new.`);
      await this.loadAll();
    } catch (error) {
      this.fail(error);
    } finally {
      this.fetching.set(false);
    }
  }
  async saveAnswer(answer: Answer, text: string): Promise<void> {
    try {
      await this.api.saveAnswer(answer.id, text);
      this.toast('Answer updated. It will be used from now on.');
      await this.loadMeta();
    } catch (error) {
      this.fail(error);
    }
  }
}
