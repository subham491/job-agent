import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  // The built Angular app, when there is one (npm run web:build). The API works without it.
  const web = join(process.cwd(), 'web', 'dist', 'web', 'browser');
  if (existsSync(web)) app.useStaticAssets(web);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
