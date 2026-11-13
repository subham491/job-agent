import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { reportNeedsUser } from '../connectors/job-connector.js';
import { NaukriConnector } from '../connectors/naukri/naukri.connector.js';
import { JobsService } from './jobs.service.js';

// Every field is optional: an empty body searches the profile's desired roles in its preferred cities.
const fetchSchema = z.object({
  // Each keyword and city pair is at least one page load on Naukri, so keep the lists short.
  keywords: z.array(z.string().min(1)).min(1).max(5).optional(),
  locations: z.array(z.string().min(1)).min(1).max(5).optional(),
  minExpYears: z.number().int().min(0).max(40).optional(),
  /** Fresh postings get the most replies, so a day is the default. */
  postedWithinDays: z.number().int().min(1).max(30).default(1),
  maxPages: z.number().int().min(1).max(5).default(3),
  /** Also save the jobs Naukri recommends for the logged-in profile. */
  recommended: z.boolean().default(true),
});

const minScoreSchema = z.coerce.number().int().min(0).max(100).default(70);
const daysSchema = z.coerce.number().int().min(1).max(30).default(1);

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly naukri: NaukriConnector,
    private readonly jobs: JobsService,
  ) {}

  @Get()
  latest(): Promise<unknown[]> {
    return this.jobs.latest();
  }

  /** Strong, fresh matches by default: GET /api/jobs/matches?min=70&days=1 */
  @Get('matches')
  matches(
    @Query('min') min?: string,
    @Query('days') days?: string,
  ): Promise<unknown[]> {
    const minScore = minScoreSchema.safeParse(min);
    const maxAge = daysSchema.safeParse(days);
    if (!minScore.success || !maxAge.success) {
      throw new BadRequestException(
        'min must be a whole number from 0 to 100 and days from 1 to 30',
      );
    }
    return this.jobs.matches(minScore.data, maxAge.data);
  }

  /** Strong, scored, applied and waiting counts. */
  @Get('summary')
  summary(): ReturnType<JobsService['summary']> {
    return this.jobs.summary();
  }

  /** "Not for me" on a match, or undoing it. */
  @Put('matches/:id/dismissed')
  async dismiss(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const parsed = z.object({ dismissed: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Send { "dismissed": true or false }');
    await this.jobs.dismiss(id, parsed.data.dismissed);
    return { ok: true };
  }

  @Post('fetch/naukri')
  async fetchNaukri(
    @Body() body: unknown,
  ): Promise<{ found: number; added: number; scored: number }> {
    const parsed = fetchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(z.prettifyError(parsed.error));
    }
    const query = { ...(await this.jobs.searchDefaults()), ...parsed.data };
    const { keywords, locations } = query;
    if (!keywords?.length || !locations?.length) {
      throw new BadRequestException(
        'Nothing to search for. Send keywords and locations, or import the profile first: POST /api/profile/sync/naukri',
      );
    }
    const found = await reportNeedsUser(async () => {
      const jobs = await this.naukri.search({ ...query, keywords, locations });
      if (query.recommended) {
        // Naukri's recommendations are not filtered by age, so apply the same limit here.
        const oldest = Date.now() - query.postedWithinDays * 86_400_000;
        const recommended = await this.naukri.recommended();
        jobs.push(
          ...recommended.filter(
            (job) => job.postedAt && job.postedAt.getTime() >= oldest,
          ),
        );
      }
      return jobs;
    });
    // The same job can be in both lists; the last copy wins.
    const unique = new Map(found.map((job) => [job.externalId, job]));
    const saved = await this.jobs.saveFound(this.naukri.site, [
      ...unique.values(),
    ]);
    return { ...saved, scored: await this.jobs.scoreAll() };
  }
}
