import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { demoModeEnabled } from '../src/auth/demo';

/**
 * Données de DÉMONSTRATION pour essayer l'interface (dépôts fictifs, marques de Côte d'Ivoire, prix inventés).
 * À ne jamais lancer sur une base de production.
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  // Autorisé en production seulement pour la démo en ligne protégée (DEMO_ACCESS_KEY), dont la base ne sert qu'à la démo.
  if (process.env.NODE_ENV === 'production' && !demoModeEnabled()) throw new Error('seed-demo interdit en production');

  // Anciennes marques fictives renommées (leurs produits et commandes de démo sont conservés) : les photos de
  // bouteilles fournies par iGaz (web/lib/media.ts) s'affichent ainsi dans la démo.
  const RENAMED: Record<string, string> = { Petroci: 'Soleil Gaz', 'Pétro Ivoire': 'Lagune Gaz' };
  const brands = [];
  for (const name of ['Petroci', 'Pétro Ivoire', 'TotalEnergies', 'Shell']) {
    const exists = await prisma.gasBrand.findUnique({ where: { name } });
    const old = !exists && RENAMED[name] ? await prisma.gasBrand.findUnique({ where: { name: RENAMED[name] } }) : null;
    brands.push(exists ?? (old
      ? await prisma.gasBrand.update({ where: { id: old.id }, data: { name } })
      : await prisma.gasBrand.create({ data: { name } })));
  }
  const cyl = Object.fromEntries(await Promise.all(['B3', 'B6', 'B12'].map(async (label) =>
    [label, await prisma.cylinderType.findUniqueOrThrow({ where: { label } })] as const)));
  const zone = Object.fromEntries(await Promise.all(['Cocody', 'Yopougon', 'Abobo', 'Marcory'].map(async (name) =>
    [name, await prisma.serviceZone.findUniqueOrThrow({ where: { name } })] as const)));

  const depots = [
    { phone: '+2250701000101', owner: 'Gérant Angré', business: 'Dépôt Angré Gaz', store: 'Dépôt Angré Gaz', address: 'Angré 8e tranche', fee: 500,
      zones: ['Cocody', 'Marcory'], stock: [[0, 'B6', 7500, 1500, 14], [0, 'B12', 15500, 3500, 6], [1, 'B6', 7800, 1600, 2], [0, 'B3', 3500, 900, 20], [2, 'B12', 16000, 3600, 8]] },
    { phone: '+2250701000102', owner: 'Gérant Niangon', business: 'Gaz Niangon', store: 'Gaz Niangon', address: 'Niangon Adjamé, carrefour', fee: 700,
      zones: ['Yopougon', 'Abobo'], stock: [[1, 'B6', 7600, 1500, 9], [1, 'B12', 15000, 3400, 0], [0, 'B6', 7700, 1550, 5], [3, 'B12', 16500, 3700, 4], [0, 'B12', 15200, 3450, 7]] },
  ] as const;

  for (const d of depots) {
    const user = await prisma.user.upsert({
      where: { phone: d.phone }, update: { role: 'SUPPLIER' }, create: { phone: d.phone, name: d.owner, role: 'SUPPLIER' },
    });
    const supplier = await prisma.supplier.upsert({
      where: { userId: user.id }, update: { status: 'APPROVED' },
      create: { userId: user.id, businessName: d.business, status: 'APPROVED' },
    });
    let store = await prisma.store.findFirst({ where: { supplierId: supplier.id } });
    if (!store) {
      store = await prisma.store.create({
        data: {
          supplierId: supplier.id, name: d.store, address: d.address, phone: d.phone,
          opensAt: '06:00', closesAt: '22:00', deliveryFee: d.fee,
          areas: { create: d.zones.map((z) => ({ zoneId: zone[z].id })) },
        },
      });
    }
    for (const [b, c, price, exch, qty] of d.stock) {
      const product = await prisma.product.upsert({
        where: { storeId_brandId_cylinderTypeId: { storeId: store.id, brandId: brands[b].id, cylinderTypeId: cyl[c].id } },
        update: {}, create: { storeId: store.id, brandId: brands[b].id, cylinderTypeId: cyl[c].id, purchasePrice: price, exchangePrice: exch },
      });
      await prisma.inventory.upsert({ where: { productId: product.id }, update: {}, create: { productId: product.id, quantity: qty } });
    }
  }
  console.log('Démo prête : 2 dépôts validés (connexion : 07 01 00 01 01 et 07 01 00 01 02), marques Petroci, Pétro Ivoire, TotalEnergies, Shell.');
}

main().finally(() => prisma.$disconnect());
