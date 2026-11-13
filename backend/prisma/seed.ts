import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { normalizeIvorianPhone } from '../src/orders/order-rules';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// Les 13 communes du District autonome d'Abidjan : les 10 communes de la ville et les 3 sous-préfectures
// (Anyama, Bingerville, Songon). L'administrateur peut en désactiver ou en ajouter ensuite.
const ZONES = [
  'Abobo', 'Adjamé', 'Attécoubé', 'Cocody', 'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Treichville', 'Yopougon',
  'Anyama', 'Bingerville', 'Songon',
];
// Formats vendus à Abidjan ; l'administrateur valide les marques réellement commercialisées.
const CYLINDERS = [
  { label: 'B6', capacityKg: 6 }, { label: 'B12', capacityKg: 12 }, { label: 'B24', capacityKg: 24 }, { label: 'B28', capacityKg: 28 },
];
// Formats retirés : désactivés (jamais supprimés, d'anciennes commandes peuvent y renvoyer). Ils disparaissent de la
// recherche, du catalogue et du stock des dépôts.
const RETIRED = ['B3'];

async function main() {
  for (const name of ZONES) {
    await prisma.serviceZone.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const c of CYLINDERS) {
    await prisma.cylinderType.upsert({ where: { label: c.label }, update: {}, create: c });
  }
  await prisma.cylinderType.updateMany({ where: { label: { in: RETIRED } }, data: { isActive: false } });
  const phone = normalizeIvorianPhone(process.env.ADMIN_PHONE ?? '');
  if (!phone) throw new Error('ADMIN_PHONE invalide ou manquant');
  await prisma.user.upsert({ where: { phone }, update: { role: 'ADMIN' }, create: { phone, name: 'Administrateur', role: 'ADMIN' } });
  console.log(`Seed terminé : ${ZONES.length} zones, ${CYLINDERS.length} formats, admin ${phone}`);
}

main().finally(() => prisma.$disconnect());
