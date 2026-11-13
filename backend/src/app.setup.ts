import { INestApplication, ValidationPipe } from '@nestjs/common';
import { raw } from 'express';
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from './products/photo-rules';

/** Configuration commune à l'application et aux tests e2e. */
export function setupApp(app: INestApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // Photos de produits : envoyées telles quelles (pas de JSON). Un peu de marge au-delà de la limite, pour que
  // l'API réponde par un message clair (« Photo trop lourde ») plutôt que par une erreur du serveur.
  app.use(raw({ type: [...PHOTO_TYPES], limit: PHOTO_MAX_BYTES + 64 * 1024 }));
  return app;
}
