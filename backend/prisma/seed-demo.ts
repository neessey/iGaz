import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Données de DÉMONSTRATION pour essayer l'interface en local (marques fictives, prix inventés).
 * À ne jamais lancer sur une base de production.
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('seed-demo interdit en production');

  const brands = await Promise.all(['Soleil Gaz', 'Lagune Gaz'].map((name) =>
    prisma.gasBrand.upsert({ where: { name }, update: {}, create: { name } })));
  const cyl = Object.fromEntries(await Promise.all(['B3', 'B6', 'B12'].map(async (label) =>
    [label, await prisma.cylinderType.findUniqueOrThrow({ where: { label } })] as const)));
  const zone = Object.fromEntries(await Promise.all(['Cocody', 'Yopougon', 'Abobo', 'Marcory'].map(async (name) =>
    [name, await prisma.serviceZone.findUniqueOrThrow({ where: { name } })] as const)));

  const depots = [
    { phone: '+2250701000101', owner: 'Gérant Angré', business: 'Dépôt Angré Gaz', store: 'Dépôt Angré Gaz', address: 'Angré 8e tranche', fee: 500,
      zones: ['Cocody', 'Marcory'], stock: [[0, 'B6', 7500, 1500, 14], [0, 'B12', 15500, 3500, 6], [1, 'B6', 7800, 1600, 2], [0, 'B3', 3500, 900, 20]] },
    { phone: '+2250701000102', owner: 'Gérant Niangon', business: 'Gaz Niangon', store: 'Gaz Niangon', address: 'Niangon Adjamé, carrefour', fee: 700,
      zones: ['Yopougon', 'Abobo'], stock: [[1, 'B6', 7600, 1500, 9], [1, 'B12', 15000, 3400, 0], [0, 'B6', 7700, 1550, 5]] },
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
  console.log('Démo prête : 2 dépôts validés (connexion : 07 01 00 01 01 et 07 01 00 01 02), 2 marques fictives.');
}

main().finally(() => prisma.$disconnect());
