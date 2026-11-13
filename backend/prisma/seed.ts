import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { normalizeIvorianPhone } from '../src/orders/order-rules';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// Communes d'Abidjan de départ ; l'administrateur peut en activer d'autres ensuite.
const ZONES = ['Cocody', 'Yopougon', 'Abobo', 'Adjamé', 'Plateau', 'Marcory', 'Treichville', 'Koumassi', 'Port-Bouët', 'Attécoubé'];
// Formats usuels ; l'administrateur valide les marques réellement commercialisées.
const CYLINDERS = [{ label: 'B3', capacityKg: 3 }, { label: 'B6', capacityKg: 6 }, { label: 'B12', capacityKg: 12 }];

async function main() {
  for (const name of ZONES) {
    await prisma.serviceZone.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const c of CYLINDERS) {
    await prisma.cylinderType.upsert({ where: { label: c.label }, update: {}, create: c });
  }
  const phone = normalizeIvorianPhone(process.env.ADMIN_PHONE ?? '');
  if (!phone) throw new Error('ADMIN_PHONE invalide ou manquant');
  await prisma.user.upsert({ where: { phone }, update: { role: 'ADMIN' }, create: { phone, name: 'Administrateur', role: 'ADMIN' } });
  console.log(`Seed terminé : ${ZONES.length} zones, ${CYLINDERS.length} formats, admin ${phone}`);
}

main().finally(() => prisma.$disconnect());
