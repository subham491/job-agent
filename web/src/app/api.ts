import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AppStatus = 'SHORTLISTED' | 'APPROVED' | 'NEEDS_USER' | 'APPLIED' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN' | 'FOUND' | 'READY_FOR_REVIEW';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  minExpYears: number | null;
  maxExpYears: number | null;
  salaryText: string | null;
  skills: string[];
  url: string;
  postedAt: string | null;
  companySite?: boolean;
}
export interface Match {
  id: string;
  score: number;
  reasons: string[];
  gaps: string[];
  job: Job;
  application: { id: string; status: AppStatus } | null;
}
export interface Answered { q: string; a: string; src: string }
export interface Application {
  id: string;
  status: AppStatus;
  notes: string | null;
  appliedAt: string | null;
  updatedAt: string;
  answers: { qa?: Answered[]; pending?: { question: string; options: string[] } } | null;
  job: Job;
}
export interface Answer { id: string; question: string; answer: string; source: string }
export interface Settings { angelMode: boolean; aiEnabled: boolean }
export interface Summary { scored: number; strong: number; applied: number; needsYou: number }
export interface Keyword { keyword: string; searches: number; evidence?: string }
export interface Bucket { from: string; to: string; appearances: number }
export interface Report {
  days: number;
  performance: { totalAppearances: number; inWindow: number; changePercent: number; recruiterActions: number; buckets: Bucket[]; keywords: Keyword[] };
  advice: { covered: Keyword[]; add: Keyword[]; unproven: Keyword[] };
  headlineMissing: string[];
  keySkills: { list: string[]; bestOrder: string[]; charsUsed: number; charsAllowed: number };
}
export interface Day { date: string; appearances: number | null; refreshedAt: string | null; note: string | null }
export interface RefreshResult { refreshedAt: string; movedUp: string[]; keySkills: string[] }
export interface Boost {
  current: { headline: string; keySkills: string[] };
  proposed: { headline: string; keySkills: string[]; added: string[]; dropped: string[]; rejected: string[] };
  why: { headline: string; keySkills: string };
}

/** Every call the screens make to the backend. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private get<T>(path: string) { return firstValueFrom(this.http.get<T>(`/api/${path}`)); }
  private post<T>(path: string, body: unknown = {}) { return firstValueFrom(this.http.post<T>(`/api/${path}`, body)); }
  private put<T>(path: string, body: unknown) { return firstValueFrom(this.http.put<T>(`/api/${path}`, body)); }

  matches(days: number) { return this.get<Match[]>(`jobs/matches?min=0&days=${days}`); }
  summary() { return this.get<Summary>('jobs/summary'); }
  fetchJobs() { return this.post<{ found: number; added: number; scored: number }>('jobs/fetch/naukri'); }
  dismiss(matchId: string, dismissed: boolean) { return this.put(`jobs/matches/${matchId}/dismissed`, { dismissed }); }

  applications() { return this.get<Application[]>('applications'); }
  apply(jobId: string) { return this.post<Application>('applications', { jobId }); }
  applyTop(limit: number) { return this.post<{ queued: number }>('applications/top', { limit }); }
  shortlist(jobId: string, on: boolean) { return this.post('applications/shortlist', { jobId, on }); }
  answerPending(id: string, answer: string) { return this.post<Application>(`applications/${id}/answer`, { answer }); }
  retry(id: string) { return this.post<Application>(`applications/${id}/retry`); }

  answers() { return this.get<Answer[]>('answers'); }
  saveAnswer(id: string, answer: string) { return this.put<Answer>(`answers/${id}`, { answer }); }
  settings() { return this.get<Settings>('settings'); }
  saveSettings(angelMode: boolean) { return this.put<Settings>('settings', { angelMode }); }

  report(days: number) { return this.post<Report>(`profile/report/naukri?days=${days}`); }
  visibility() { return this.get<Day[]>('profile/visibility'); }
  runRoutine() { return this.post<RefreshResult>('profile/refresh/naukri'); }
  proposeBoost() { return this.post<Boost>('profile/boost/naukri'); }
  applyBoost(headline: string, keySkills: string[]) { return this.post<{ headline: string; keySkills: string[] }>('profile/boost/naukri/apply', { headline, keySkills }); }
}

/** The backend's own message when it sent one, otherwise a plain fallback. */
export function errorText(error: unknown): string {
  const body = (error as { error?: { message?: string | string[] } }).error;
  const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
  return message ?? 'The app could not reach the server. Is it running?';
}

export const day = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
