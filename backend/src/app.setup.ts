import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Configuration commune à l'application et aux tests e2e. */
export function setupApp(app: INestApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  return app;
}
