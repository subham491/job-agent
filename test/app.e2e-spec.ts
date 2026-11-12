import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { randomBytes } from 'node:crypto';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = { $queryRaw: vi.fn(), $disconnect: vi.fn() };

  beforeEach(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.VAULT_KEY = randomBytes(32).toString('base64');
    const { AppModule } = await import('./../src/app.module.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('reports ok when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', db: 'up' });
  });

  it('reports degraded when the database is down', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('down'));
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'degraded', db: 'down' });
  });

  afterEach(async () => {
    await app.close();
  });
});
