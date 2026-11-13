process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://igaz:igaz@127.0.0.1:5433/igaz_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.PAYMENT_WEBHOOK_SECRET = 'webhook-test-secret';
process.env.COD_MAX_AMOUNT = '100000';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { SmsProvider } from '../src/auth/sms.provider';
import { PrismaService } from '../src/prisma/prisma.service';

class FakeSms extends SmsProvider {
  last = new Map<string, string>();
  async send(phone: string, message: string) {
    this.last.set(phone, /(\d{6})/.exec(message)![1]);
  }
}

describe('iGaz MVP — parcours complet', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sms = new FakeSms();
  const http = () => request(app.getHttpServer());

  const phones = {
    admin: '0700000000', client: '0701000001', client2: '0701000002',
    supA: '0702000001', supB: '0702000002',
  };
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  async function login(who: keyof typeof phones) {
    await http().post('/auth/otp/request').send({ phone: phones[who] }).expect(200);
    const code = sms.last.get('+225' + phones[who])!;
    const res = await http().post('/auth/otp/verify').send({ phone: phones[who], code, name: who }).expect(200);
    tokens[who] = res.body.accessToken;
    return res.body;
  }

  // Données partagées entre les tests
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SmsProvider).useValue(sms).compile();
    app = setupApp(moduleRef.createNestApplication({ rawBody: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User","OtpCode","ServiceZone","GasBrand","CylinderType" RESTART IDENTITY CASCADE`);
    await prisma.user.create({ data: { phone: '+225' + phones.admin, role: 'ADMIN', name: 'admin' } });
  });

  afterAll(async () => {
    await app.close();
  });

  // ------------------------------------------------------------------ accès
  it('refuse les routes protégées sans jeton et les actions hors rôle', async () => {
    await http().get('/orders').expect(401);
    await http().get('/auth/me').set('Authorization', 'Bearer n-importe-quoi').expect(401);
    await login('client');
    await http().post('/admin/brands').set(auth('client')).send({ name: 'Total' }).expect(403);
  });

  it('OTP : mauvais code refusé, code à usage unique, limitation des demandes', async () => {
    await http().post('/auth/otp/request').send({ phone: '+33612345678' }).expect(400);

    const phone = '0709999999';
    for (let i = 0; i < 3; i++) await http().post('/auth/otp/request').send({ phone }).expect(200);
    await http().post('/auth/otp/request').send({ phone }).expect(429);

    const good = sms.last.get('+225' + phone)!;
    const bad = good === '000000' ? '111111' : '000000';
    await http().post('/auth/otp/verify').send({ phone, code: bad }).expect(401);
    await http().post('/auth/otp/verify').send({ phone, code: good }).expect(200);
    await http().post('/auth/otp/verify').send({ phone, code: good }).expect(401); // déjà consommé
  });

  // --------------------------------------------------------------- catalogue
  it('l’admin gère le catalogue central, journalisé', async () => {
    await login('admin');
    const total = await http().post('/admin/brands').set(auth('admin')).send({ name: 'Total' }).expect(201);
    const petro = await http().post('/admin/brands').set(auth('admin')).send({ name: 'Petro Ivoire' }).expect(201);
    await http().post('/admin/brands').set(auth('admin')).send({ name: 'Total' }).expect(409);
    const b6 = await http().post('/admin/cylinder-types').set(auth('admin')).send({ label: 'B6', capacityKg: 6 }).expect(201);
    const b12 = await http().post('/admin/cylinder-types').set(auth('admin')).send({ label: 'B12', capacityKg: 12 }).expect(201);
    await http().post('/admin/cylinder-types').set(auth('admin')).send({ label: 'six', capacityKg: 6 }).expect(400);
    const cocody = await http().post('/admin/zones').set(auth('admin')).send({ name: 'Cocody' }).expect(201);
    const yop = await http().post('/admin/zones').set(auth('admin')).send({ name: 'Yopougon' }).expect(201);
    Object.assign(ids, { total: total.body.id, petro: petro.body.id, b6: b6.body.id, b12: b12.body.id, cocody: cocody.body.id, yop: yop.body.id });

    const brands = await http().get('/catalog/brands').expect(200); // public
    expect(brands.body.map((b: any) => b.name)).toEqual(['Petro Ivoire', 'Total']);
    expect(await prisma.auditLog.count({ where: { entity: 'GasBrand', action: 'CREATE' } })).toBe(2);
  });

  // -------------------------------------------------------------- fournisseurs
  it('un fournisseur non validé ne peut rien publier ; l’admin valide', async () => {
    await login('supA');
    await login('supB');
    await http().post('/suppliers/register').set(auth('supA')).send({ businessName: 'Dépôt Cocody Gaz' }).expect(201);
    await http().post('/suppliers/register').set(auth('supB')).send({ businessName: 'Gaz Yopougon' }).expect(201);
    await http().post('/suppliers/register').set(auth('supA')).send({ businessName: 'Doublon' }).expect(409);

    // Le rôle est lu en base à chaque requête : le jeton existant fonctionne sans reconnexion.
    await http().post('/suppliers/me/stores').set(auth('supA'))
      .send({ name: 'Dépôt A', address: 'Angré 8e tranche', phone: '0712345678', zoneIds: [ids.cocody] })
      .expect(403); // statut PENDING

    const list = await http().get('/admin/suppliers?status=PENDING').set(auth('admin')).expect(200);
    expect(list.body).toHaveLength(2);
    for (const s of list.body) {
      await http().post(`/admin/suppliers/${s.id}/approve`).set(auth('admin')).expect(201);
      await http().post(`/admin/suppliers/${s.id}/approve`).set(auth('admin')).expect(409); // déjà validé
    }
    expect(await prisma.auditLog.count({ where: { action: 'SUPPLIER_APPROVED' } })).toBe(2);
  });

  it('création des boutiques et des produits, avec stock journalisé', async () => {
    const storeA = await http().post('/suppliers/me/stores').set(auth('supA')).send({
      name: 'Dépôt A', address: 'Angré 8e tranche', phone: '0712345678',
      opensAt: '00:00', closesAt: '00:00', deliveryFee: 500, zoneIds: [ids.cocody],
    }).expect(201);
    const storeB = await http().post('/suppliers/me/stores').set(auth('supB')).send({
      name: 'Dépôt B', address: 'Niangon', phone: '0722334455',
      opensAt: '00:00', closesAt: '00:00', deliveryFee: 700, zoneIds: [ids.yop],
    }).expect(201);
    ids.storeA = storeA.body.id;
    ids.storeB = storeB.body.id;

    await http().post('/suppliers/me/stores').set(auth('supA')).send({
      name: 'Sans mode', address: 'x y z', phone: '0712345678', zoneIds: [ids.cocody],
      offersDelivery: false, offersPickup: false,
    }).expect(400);

    const pA = await http().post(`/stores/${ids.storeA}/products`).set(auth('supA'))
      .send({ brandId: ids.total, cylinderTypeId: ids.b6, purchasePrice: 7500, exchangePrice: 1500, quantity: 10 }).expect(201);
    ids.prodA = pA.body.id;
    expect(pA.body.inventory.quantity).toBe(10);
    await http().post(`/stores/${ids.storeA}/products`).set(auth('supA'))
      .send({ brandId: ids.total, cylinderTypeId: ids.b6, purchasePrice: 1, exchangePrice: 1 }).expect(409);
    const pA12 = await http().post(`/stores/${ids.storeA}/products`).set(auth('supA'))
      .send({ brandId: ids.total, cylinderTypeId: ids.b12, purchasePrice: 15000, exchangePrice: 3500, quantity: 0 }).expect(201);
    ids.prodA12 = pA12.body.id;
    const pB = await http().post(`/stores/${ids.storeB}/products`).set(auth('supB'))
      .send({ brandId: ids.petro, cylinderTypeId: ids.b6, purchasePrice: 7000, exchangePrice: 1400, quantity: 5 }).expect(201);
    ids.prodB = pB.body.id;

    await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: 12 }).expect(200);
    const moves = await http().get(`/stores/${ids.storeA}/products/${ids.prodA}/movements`).set(auth('supA')).expect(200);
    expect(moves.body.map((m: any) => m.delta).sort((a: number, b: number) => a - b)).toEqual([2, 10]);
    await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: -1 }).expect(400);
  });

  it('cloisonnement : un fournisseur ne voit ni ne modifie la boutique d’un autre', async () => {
    await http().get(`/stores/${ids.storeA}/products`).set(auth('supB')).expect(404);
    await http().post(`/stores/${ids.storeA}/products`).set(auth('supB'))
      .send({ brandId: ids.petro, cylinderTypeId: ids.b12, purchasePrice: 1, exchangePrice: 1 }).expect(404);
    await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supB')).send({ quantity: 999 }).expect(404);
    await http().patch(`/suppliers/me/stores/${ids.storeA}`).set(auth('supB')).send({ deliveryFee: 0 }).expect(404);
  });

  // ----------------------------------------------------------------- recherche
  it('la recherche ne propose que des offres réellement commandables', async () => {
    let res = await http().get(`/products?zoneId=${ids.cocody}`).expect(200);
    expect(res.body.map((p: any) => p.id)).toEqual([ids.prodA]); // B12 à 0 absent, boutique B hors zone
    res = await http().get(`/products?zoneId=${ids.yop}`).expect(200);
    expect(res.body.map((p: any) => p.id)).toEqual([ids.prodB]);
    res = await http().get(`/products?cylinderTypeId=${ids.b6}`).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].purchasePrice).toBeLessThanOrEqual(res.body[1].purchasePrice);

    await http().patch(`/suppliers/me/stores/${ids.storeB}`).set(auth('supB')).send({ isOpen: false }).expect(200);
    res = await http().get(`/products?zoneId=${ids.yop}`).expect(200);
    expect(res.body).toHaveLength(0); // boutique suspendue
    await http().patch(`/suppliers/me/stores/${ids.storeB}`).set(auth('supB')).send({ isOpen: true }).expect(200);
  });

  // ------------------------------------------------------- commande + livraison
  describe('commande en livraison, paiement à la livraison', () => {
    it('règles de création : stock, échange compatible, adresse, zone', async () => {
      await login('client');
      const addr = await http().post('/addresses').set(auth('client'))
        .send({ zoneId: ids.cocody, details: 'Angré, près de la pharmacie' }).expect(201);
      ids.addr = addr.body.id;
      const addrYop = await http().post('/addresses').set(auth('client'))
        .send({ zoneId: ids.yop, details: 'Niangon' }).expect(201);

      const base = { storeId: ids.storeA, fulfillment: 'DELIVERY', paymentMethod: 'CASH_ON_DELIVERY', addressId: ids.addr };

      // stock insuffisant → bloqué
      await http().post('/orders').set(auth('client')).send({
        ...base, items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 13 }],
      }).expect(409);
      // produit à stock zéro → bloqué
      await http().post('/orders').set(auth('client')).send({
        ...base, items: [{ productId: ids.prodA12, kind: 'PURCHASE', quantity: 1 }],
      }).expect(409);
      // échange avec une autre marque → refusé même à capacité égale
      await http().post('/orders').set(auth('client')).send({
        ...base, items: [{ productId: ids.prodA, kind: 'EXCHANGE', quantity: 1, returnedBrandId: ids.petro, returnedCylinderTypeId: ids.b6 }],
      }).expect(422);
      // échange sans préciser la bouteille vide → refusé
      await http().post('/orders').set(auth('client')).send({
        ...base, items: [{ productId: ids.prodA, kind: 'EXCHANGE', quantity: 1 }],
      }).expect(422);
      // livraison sans adresse / hors zone du dépôt
      await http().post('/orders').set(auth('client')).send({
        ...base, addressId: undefined, items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(400);
      await http().post('/orders').set(auth('client')).send({
        ...base, addressId: addrYop.body.id, items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(422);
      // adresse d'un autre client
      await login('client2');
      await http().post('/orders').set(auth('client2')).send({
        ...base, items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(400);
      // plafond du paiement à la livraison
      await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: 40 }).expect(200);
      await http().post('/orders').set(auth('client')).send({
        ...base, items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 14 }],
      }).expect(422);
      await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: 12 }).expect(200);
      // un fournisseur ne peut pas commander
      await http().post('/orders').set(auth('supA')).send({
        ...base, items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(403);
    });

    it('cycle complet : création → acceptation (stock) → livraison → code → clôture', async () => {
      const res = await http().post('/orders').set(auth('client')).send({
        storeId: ids.storeA, fulfillment: 'DELIVERY', paymentMethod: 'CASH_ON_DELIVERY', addressId: ids.addr,
        items: [
          { productId: ids.prodA, kind: 'PURCHASE', quantity: 1 },
          { productId: ids.prodA, kind: 'EXCHANGE', quantity: 2, returnedBrandId: ids.total, returnedCylinderTypeId: ids.b6 },
        ],
      }).expect(201);
      const order = res.body;
      ids.order1 = order.id;
      expect(order.status).toBe('SUBMITTED');
      expect(order.subtotal).toBe(7500 + 2 * 1500);
      expect(order.deliveryFee).toBe(500);
      expect(order.total).toBe(11000);
      expect(order.confirmationCode).toMatch(/^\d{6}$/);
      const code = order.confirmationCode;

      // Le stock n'est décompté qu'à l'acceptation
      expect((await prisma.inventory.findUnique({ where: { productId: ids.prodA } }))!.quantity).toBe(12);

      // Le fournisseur voit la commande, sans le code de confirmation ; l'autre fournisseur ne la voit pas
      const asSupplier = await http().get(`/orders/${order.id}`).set(auth('supA')).expect(200);
      expect(asSupplier.body.confirmationCode).toBeUndefined();
      await http().get(`/orders/${order.id}`).set(auth('supB')).expect(404);
      await http().get(`/orders/${order.id}`).set(auth('client2')).expect(404);
      const listB = await http().get('/orders').set(auth('supB')).expect(200);
      expect(listB.body).toHaveLength(0);

      // Un autre fournisseur ne peut pas agir sur la commande
      await http().post(`/orders/${order.id}/accept`).set(auth('supB')).expect(404);
      // Impossible de clôturer / livrer avant acceptation
      await http().post(`/orders/${order.id}/dispatch`).set(auth('supA')).expect(409);
      await http().post(`/orders/${order.id}/complete`).set(auth('supA')).send({ code }).expect(409);

      await http().post(`/orders/${order.id}/accept`).set(auth('supA')).expect(200);
      expect((await prisma.inventory.findUnique({ where: { productId: ids.prodA } }))!.quantity).toBe(9);
      await http().post(`/orders/${order.id}/accept`).set(auth('supA')).expect(409); // pas de double décompte
      expect((await prisma.inventory.findUnique({ where: { productId: ids.prodA } }))!.quantity).toBe(9);

      await http().post(`/orders/${order.id}/ready`).set(auth('supA')).expect(409); // c'est une livraison
      await http().post(`/orders/${order.id}/dispatch`).set(auth('supA')).expect(200);

      // Clôture : code faux refusé, bon code accepté
      const wrong = code === '123456' ? '654321' : '123456';
      await http().post(`/orders/${order.id}/complete`).set(auth('supA')).send({ code: wrong }).expect(400);
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('OUT_FOR_DELIVERY');
      const done = await http().post(`/orders/${order.id}/complete`).set(auth('supA')).send({ code }).expect(200);
      expect(done.body.status).toBe('COMPLETED');
      expect(done.body.payments[0].status).toBe('SUCCEEDED'); // espèces encaissées à la remise
      expect(done.body.events.map((e: any) => e.status)).toEqual(['SUBMITTED', 'ACCEPTED', 'OUT_FOR_DELIVERY', 'COMPLETED']);

      // Plus aucune annulation possible après clôture
      await http().post(`/orders/${order.id}/cancel`).set(auth('client')).expect(409);
      await http().post(`/admin/orders/${order.id}/cancel`).set(auth('admin')).send({ reason: 'test annulation' }).expect(409);
    });

    it('un changement de prix n’affecte pas une commande déjà validée', async () => {
      const res = await http().post('/orders').set(auth('client')).send({
        storeId: ids.storeA, fulfillment: 'PICKUP', paymentMethod: 'CASH_ON_DELIVERY',
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(201);
      ids.order2 = res.body.id;
      await http().patch(`/stores/${ids.storeA}/products/${ids.prodA}`).set(auth('supA')).send({ purchasePrice: 9999 }).expect(200);
      const again = await http().get(`/orders/${ids.order2}`).set(auth('client')).expect(200);
      expect(again.body.total).toBe(7500);
      expect(again.body.items[0].unitPrice).toBe(7500);
      await http().patch(`/stores/${ids.storeA}/products/${ids.prodA}`).set(auth('supA')).send({ purchasePrice: 7500 }).expect(200);
    });
  });

  // ------------------------------------------------------------------- retrait
  describe('commande en retrait', () => {
    it('retrait : prête → code → clôture ; refus et annulation libèrent / ne touchent pas le stock', async () => {
      // order2 : retrait, déjà créée
      const stock = async () => (await prisma.inventory.findUnique({ where: { productId: ids.prodA } }))!.quantity;
      const before = await stock(); // 9

      await http().post(`/orders/${ids.order2}/dispatch`).set(auth('supA')).expect(409); // retrait, pas livraison
      await http().post(`/orders/${ids.order2}/accept`).set(auth('supA')).expect(200);
      expect(await stock()).toBe(before - 1);
      await http().post(`/orders/${ids.order2}/ready`).set(auth('supA')).expect(200);
      const code = (await prisma.order.findUnique({ where: { id: ids.order2 } }))!.confirmationCode;
      await http().post(`/orders/${ids.order2}/complete`).set(auth('supA')).send({ code }).expect(200);

      // Refus fournisseur : pas de décompte
      const o3 = await http().post('/orders').set(auth('client')).send({
        storeId: ids.storeA, fulfillment: 'PICKUP', paymentMethod: 'CASH_ON_DELIVERY',
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 2 }],
      }).expect(201);
      const afterO2 = await stock();
      await http().post(`/orders/${o3.body.id}/reject`).set(auth('supA')).send({ reason: 'Rupture imprévue' }).expect(200);
      expect(await stock()).toBe(afterO2);

      // Annulation client avant acceptation : pas de décompte, puis plus de cancel après acceptation
      const o4 = await http().post('/orders').set(auth('client')).send({
        storeId: ids.storeA, fulfillment: 'PICKUP', paymentMethod: 'CASH_ON_DELIVERY',
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(201);
      await http().post(`/orders/${o4.body.id}/cancel`).set(auth('client2')).expect(404);
      await http().post(`/orders/${o4.body.id}/cancel`).set(auth('client')).expect(200);
      expect(await stock()).toBe(afterO2);

      const o5 = await http().post('/orders').set(auth('client')).send({
        storeId: ids.storeA, fulfillment: 'PICKUP', paymentMethod: 'CASH_ON_DELIVERY',
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 3 }],
      }).expect(201);
      await http().post(`/orders/${o5.body.id}/accept`).set(auth('supA')).expect(200);
      expect(await stock()).toBe(afterO2 - 3);
      await http().post(`/orders/${o5.body.id}/cancel`).set(auth('client')).expect(409);

      // Annulation admin après acceptation : stock restitué, justification obligatoire, audit
      await http().post(`/admin/orders/${o5.body.id}/cancel`).set(auth('admin')).send({ reason: 'x' }).expect(400);
      await http().post(`/admin/orders/${o5.body.id}/cancel`).set(auth('admin')).send({ reason: 'Client injoignable' }).expect(200);
      expect(await stock()).toBe(afterO2);
      expect(await prisma.auditLog.count({ where: { action: 'ORDER_CANCEL', entityId: o5.body.id } })).toBe(1);
      expect(await prisma.stockMovement.count({ where: { orderId: o5.body.id, reason: 'ORDER_RELEASED' } })).toBe(1);
    });

    it('deux commandes concurrentes ne peuvent pas faire passer le stock sous zéro', async () => {
      await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: 3 }).expect(200);
      const make = () => http().post('/orders').set(auth('client')).send({
        storeId: ids.storeA, fulfillment: 'PICKUP', paymentMethod: 'CASH_ON_DELIVERY',
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 2 }],
      }).expect(201);
      const [x, y] = await Promise.all([make(), make()]);
      const results = await Promise.all([x, y].map((o) => http().post(`/orders/${o.body.id}/accept`).set(auth('supA'))));
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await prisma.inventory.findUnique({ where: { productId: ids.prodA } }))!.quantity).toBe(1);
    });
  });

  // ------------------------------------------------------------ mobile money
  describe('paiement mobile money', () => {
    const sign = (body: object) => {
      const raw = JSON.stringify(body);
      return { raw, sig: createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!).update(raw).digest('hex') };
    };
    const webhook = (body: object, signature?: string) => {
      const { raw, sig } = sign(body);
      const r = http().post('/payments/webhook').set('Content-Type', 'application/json');
      if (signature !== null) r.set('x-igaz-signature', signature ?? sig);
      return r.send(raw);
    };

    it('commande payable : la confirmation ne vient que du webhook signé, une seule fois', async () => {
      await http().put(`/stores/${ids.storeB}/products/${ids.prodB}/stock`).set(auth('supB')).send({ quantity: 5 }).expect(200);
      await login('client2');
      const addr = await http().post('/addresses').set(auth('client2')).send({ zoneId: ids.yop, details: 'Niangon sud' }).expect(201);
      const res = await http().post('/orders').set(auth('client2')).send({
        storeId: ids.storeB, fulfillment: 'DELIVERY', paymentMethod: 'MOBILE_MONEY', addressId: addr.body.id,
        items: [{ productId: ids.prodB, kind: 'PURCHASE', quantity: 1 }],
      }).expect(201);
      const orderId = res.body.id;
      expect(res.body.status).toBe('PENDING_PAYMENT');
      expect(res.body.total).toBe(7700);

      // Non payée : le fournisseur ne peut pas l'accepter
      await http().post(`/orders/${orderId}/accept`).set(auth('supB')).expect(409);

      // Double clic : même clé, ou clé différente → une seule transaction
      const k = 'cle-idempotence-0001';
      const p1 = await http().post(`/orders/${orderId}/payments`).set(auth('client2')).send({ idempotencyKey: k }).expect(200);
      const p2 = await http().post(`/orders/${orderId}/payments`).set(auth('client2')).send({ idempotencyKey: k }).expect(200);
      const p3 = await http().post(`/orders/${orderId}/payments`).set(auth('client2')).send({ idempotencyKey: 'autre-cle-0002' }).expect(200);
      expect(p2.body.id).toBe(p1.body.id);
      expect(p3.body.id).toBe(p1.body.id);
      expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
      expect(p1.body.amount).toBe(7700);
      await http().post(`/orders/${orderId}/payments`).set(auth('client')).send({ idempotencyKey: 'pirate-0000001' }).expect(404);

      const payload = { reference: p1.body.id, status: 'SUCCEEDED', amount: 7700, providerRef: 'WAVE-123' };
      // signature absente / fausse / montant falsifié → refus, commande toujours en attente
      await webhook(payload, null as any).expect(401);
      await webhook(payload, 'deadbeef').expect(401);
      await http().post('/payments/webhook').set('Content-Type', 'application/json')
        .set('x-igaz-signature', sign({ ...payload, amount: 1 }).sig).send(JSON.stringify(payload)).expect(401);
      await webhook({ ...payload, amount: 1 }).expect(400);
      expect((await prisma.order.findUnique({ where: { id: orderId } }))!.status).toBe('PENDING_PAYMENT');

      // Webhook valide : la commande est transmise ; le rejeu est ignoré
      await webhook(payload).expect(200);
      const replay = await webhook(payload).expect(200);
      expect(replay.body.duplicate).toBe(true);
      const after = await http().get(`/orders/${orderId}`).set(auth('client2')).expect(200);
      expect(after.body.status).toBe('SUBMITTED');
      expect(after.body.payments[0].status).toBe('SUCCEEDED');
      expect(after.body.events.filter((e: any) => e.status === 'SUBMITTED')).toHaveLength(1);
      await http().post(`/orders/${orderId}/payments`).set(auth('client2')).send({ idempotencyKey: 'tardif-00000003' }).expect(409);

      await http().post(`/orders/${orderId}/accept`).set(auth('supB')).expect(200);
    });

    it('paiement échoué : la commande reste non payée ; un nouvel essai est possible', async () => {
      const addr = (await http().get('/addresses').set(auth('client2')).expect(200)).body[0];
      const res = await http().post('/orders').set(auth('client2')).send({
        storeId: ids.storeB, fulfillment: 'DELIVERY', paymentMethod: 'MOBILE_MONEY', addressId: addr.id,
        items: [{ productId: ids.prodB, kind: 'PURCHASE', quantity: 1 }],
      }).expect(201);
      const p1 = await http().post(`/orders/${res.body.id}/payments`).set(auth('client2')).send({ idempotencyKey: 'essai-numero-0001' }).expect(200);
      await webhook({ reference: p1.body.id, status: 'FAILED', amount: 7700 }).expect(200);
      expect((await prisma.order.findUnique({ where: { id: res.body.id } }))!.status).toBe('PENDING_PAYMENT');
      expect((await prisma.payment.findUnique({ where: { id: p1.body.id } }))!.status).toBe('FAILED');

      const p2 = await http().post(`/orders/${res.body.id}/payments`).set(auth('client2')).send({ idempotencyKey: 'essai-numero-0002' }).expect(200);
      expect(p2.body.id).not.toBe(p1.body.id);
      await webhook({ reference: p2.body.id, status: 'SUCCEEDED', amount: 7700, providerRef: 'WAVE-456' }).expect(200);
      expect((await prisma.order.findUnique({ where: { id: res.body.id } }))!.status).toBe('SUBMITTED');
    });
  });

  // ------------------------------------------------------------- administration
  it('correction administrative du stock : justification obligatoire et audit', async () => {
    await http().put(`/admin/products/${ids.prodA}/stock`).set(auth('admin')).send({ quantity: 7 }).expect(400);
    await http().put(`/admin/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: 7, note: 'je triche' }).expect(403);
    await http().put(`/admin/products/${ids.prodA}/stock`).set(auth('admin'))
      .send({ quantity: 7, note: 'Inventaire physique du 13/11' }).expect(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'STOCK_CORRECTION', entityId: ids.prodA } });
    expect(log).not.toBeNull();
    expect((log!.after as any).quantity).toBe(7);
    const mv = await prisma.stockMovement.findFirst({ where: { productId: ids.prodA, reason: 'ADMIN_CORRECTION' } });
    expect(mv!.note).toContain('Inventaire');
  });

  it('un fournisseur suspendu ne peut plus agir et disparaît de la recherche', async () => {
    const supplier = await prisma.supplier.findFirstOrThrow({ where: { businessName: 'Gaz Yopougon' } });
    await http().post(`/admin/suppliers/${supplier.id}/suspend`).set(auth('admin')).expect(201);
    await http().put(`/stores/${ids.storeB}/products/${ids.prodB}/stock`).set(auth('supB')).send({ quantity: 50 }).expect(403);
    const res = await http().get(`/products?zoneId=${ids.yop}`).expect(200);
    expect(res.body).toHaveLength(0);
    await http().post(`/admin/suppliers/${supplier.id}/approve`).set(auth('admin')).expect(201);
  });
});
