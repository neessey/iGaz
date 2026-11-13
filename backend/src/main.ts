import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

async function bootstrap() {
  // rawBody : nécessaire pour vérifier la signature des webhooks de paiement.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  setupApp(app);
  app.enableCors();
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
