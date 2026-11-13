// Build de l'API sur Vercel (lancé par « npm run vercel-build ») :
// 1. client Prisma ; 2. migrations, par la connexion DIRECTE à la base (Neon fournit DATABASE_URL_UNPOOLED : les
// migrations ne passent pas par le pooler) ; 3. données de base si ADMIN_PHONE est défini ; 4. données de démo si
// SEED_DEMO=true (démo en ligne uniquement) ; 5. compilation NestJS.
import { execSync } from 'node:child_process';

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
const direct = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!direct) throw new Error('DATABASE_URL manquant : reliez la base Neon au projet Vercel de l’API');

run('npx prisma generate');
run('npx prisma migrate deploy', { DATABASE_URL: direct });
if (process.env.ADMIN_PHONE) run('npm run seed', { DATABASE_URL: direct });
if (process.env.SEED_DEMO === 'true') run('npm run seed:demo', { DATABASE_URL: direct });
run('npx nest build');
