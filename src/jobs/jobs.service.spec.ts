import type { PrismaService } from '../prisma/prisma.service.js';
import { dedupeKey } from './dedupe.js';
import { JobsService } from './jobs.service.js';

describe('JobsService.saveFound', () => {
  it('adds unseen jobs, skips repeats and marks all as seen', async () => {
    const job = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    };
    const service = new JobsService({ job } as unknown as PrismaService);
    const found = [
      { externalId: '1', title: 'Java Dev', company: 'Acme', skills: [], url: 'u1' },
      { externalId: '2', title: 'Java Dev', company: 'Beta', skills: [], url: 'u2' },
    ];

    await expect(service.saveFound('NAUKRI', found)).resolves.toEqual({
      found: 2,
      added: 1,
    });

    const created = job.createMany.mock.calls[0]?.[0];
    expect(created.skipDuplicates).toBe(true);
    expect(created.data[0]).toMatchObject({
      site: 'NAUKRI',
      externalId: '1',
      dedupeKey: dedupeKey({ company: 'Acme', title: 'Java Dev' }),
    });
    expect(job.updateMany.mock.calls[0]?.[0].where).toEqual({
      site: 'NAUKRI',
      externalId: { in: ['1', '2'] },
    });
  });
});
