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
  const cyl = Object.fromEntries(await Promise.all(['B6', 'B12', 'B24', 'B28'].map(async (label) =>
    [label, await prisma.cylinderType.findUniqueOrThrow({ where: { label } })] as const)));
  // Prix de la recharge (échange d'une bouteille vide) donnés par iGaz ; prix d'achat avec la bouteille : provisoires.
  // Remis à ces valeurs à chaque lancement (donc à chaque déploiement de la démo).
  const PRICE: Record<string, { exchange: number; purchase: number }> = {
    B6: { exchange: 2200, purchase: 12000 }, B12: { exchange: 5500, purchase: 25000 },
    B24: { exchange: 7000, purchase: 45000 }, B28: { exchange: 9000, purchase: 50000 },
  };
  const zone = Object.fromEntries(await Promise.all(['Cocody', 'Yopougon', 'Abobo', 'Marcory'].map(async (name) =>
    [name, await prisma.serviceZone.findUniqueOrThrow({ where: { name } })] as const)));

  const depots = [
    { phone: '+2250701000101', owner: 'Gérant Angré', business: 'Dépôt Angré Gaz', store: 'Dépôt Angré Gaz', address: 'Angré 8e tranche', fee: 500,
      zones: ['Cocody', 'Marcory'], stock: [[0, 'B6', 14], [0, 'B12', 6], [1, 'B6', 2], [2, 'B12', 8], [0, 'B24', 3], [0, 'B28', 2]] },
    { phone: '+2250701000102', owner: 'Gérant Niangon', business: 'Gaz Niangon', store: 'Gaz Niangon', address: 'Niangon Adjamé, carrefour', fee: 700,
      zones: ['Yopougon', 'Abobo'], stock: [[1, 'B6', 9], [1, 'B12', 0], [0, 'B6', 5], [3, 'B12', 4], [0, 'B12', 7], [2, 'B24', 2]] },
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
    for (const [b, c, qty] of d.stock) {
      const prices = { purchasePrice: PRICE[c].purchase, exchangePrice: PRICE[c].exchange };
      const product = await prisma.product.upsert({
        where: { storeId_brandId_cylinderTypeId: { storeId: store.id, brandId: brands[b].id, cylinderTypeId: cyl[c].id } },
        update: prices, create: { storeId: store.id, brandId: brands[b].id, cylinderTypeId: cyl[c].id, ...prices },
      });
      await prisma.inventory.upsert({ where: { productId: product.id }, update: {}, create: { productId: product.id, quantity: qty } });
    }
  }
  console.log('Démo prête : 2 dépôts validés (connexion : 07 01 00 01 01 et 07 01 00 01 02), marques Petroci, Pétro Ivoire, TotalEnergies, Shell.');
}

main().finally(() => prisma.$disconnect());
