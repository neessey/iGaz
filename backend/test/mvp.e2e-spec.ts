process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://igaz:igaz@127.0.0.1:5433/igaz_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.PAYMENT_WEBHOOK_SECRET = 'webhook-test-secret';
process.env.COD_MAX_AMOUNT = '100000';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { SmsProvider } from '../src/auth/sms.provider';
import { PushPayload, PushSender, PushTarget } from '../src/notifications/push.sender';
import { PrismaService } from '../src/prisma/prisma.service';

class FakeSms extends SmsProvider {
  last = new Map<string, string>();
  messages: { phone: string; message: string }[] = [];
  async send(phone: string, message: string) {
    this.messages.push({ phone, message });
    const code = /code de connexion est (\d{6})/.exec(message);
    if (code) this.last.set(phone, code[1]);
  }
}

/** Push factice : garde les envois ; l'abonnement « gone » est expiré côté service de push. */
class FakePush extends PushSender {
  readonly enabled = true;
  readonly publicKey = 'cle-publique-de-test';
  sent: { endpoint: string; payload: PushPayload }[] = [];
  async send(target: PushTarget, payload: PushPayload) {
    if (target.endpoint.endsWith('/gone')) return false;
    this.sent.push({ endpoint: target.endpoint, payload });
    return true;
  }
}

describe('iGaz MVP — parcours complet', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sms = new FakeSms();
  const push = new FakePush();
  const http = () => request(app.getHttpServer());

  const phones = {
    admin: '0700000000', client: '0701000001', client2: '0701000002', client3: '0701000003',
    supA: '0702000001', supB: '0702000002', supC: '0702000003',
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
      .overrideProvider(SmsProvider).useValue(sms)
      .overrideProvider(PushSender).useValue(push)
      .compile();
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

    // Le code n'est jamais renvoyé par l'API, sauf démonstration locale explicite
    const hidden = await http().post('/auth/otp/request').send({ phone: '0708888888' }).expect(200);
    expect(hidden.body.devCode).toBeUndefined();
    process.env.EXPOSE_DEV_OTP = 'true';
    const shown = await http().post('/auth/otp/request').send({ phone: '0708888887' }).expect(200);
    expect(shown.body.devCode).toBe(sms.last.get('+2250708888887'));
    process.env.EXPOSE_DEV_OTP = 'false';

    // Démo en ligne protégée : code révélé seulement avec la bonne clé de démo
    process.env.DEMO_ACCESS_KEY = 'cle-de-demo-tres-longue-0123456789';
    const noKey = await http().post('/auth/otp/request').send({ phone: '0708888886' }).expect(200);
    expect(noKey.body.devCode).toBeUndefined();
    const badKey = await http().post('/auth/otp/request').set('x-igaz-demo', 'mauvaise-cle-mauvaise-cle-0000').send({ phone: '0708888886' }).expect(200);
    expect(badKey.body.devCode).toBeUndefined();
    const goodKey = await http().post('/auth/otp/request').set('x-igaz-demo', process.env.DEMO_ACCESS_KEY).send({ phone: '0708888886' }).expect(200);
    expect(goodKey.body.devCode).toBe(sms.last.get('+2250708888886'));
    delete process.env.DEMO_ACCESS_KEY;
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

    await http().get('/admin/zones').set(auth('client')).expect(403);
    expect((await http().get('/admin/zones').set(auth('admin')).expect(200)).body).toHaveLength(2);
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

  it('format retiré du catalogue : absent du catalogue, de la recherche et du stock du dépôt', async () => {
    const listed = async () => (await http().get(`/stores/${ids.storeA}/products`).set(auth('supA')).expect(200)).body.map((p: any) => p.id);
    expect(await listed()).toContain(ids.prodA12);
    await http().patch(`/admin/cylinder-types/${ids.b12}`).set(auth('admin')).send({ isActive: false }).expect(200);
    expect(await listed()).not.toContain(ids.prodA12);
    expect((await http().get('/catalog/cylinder-types').expect(200)).body.map((c: any) => c.id)).not.toContain(ids.b12);
    expect((await http().get(`/products?cylinderTypeId=${ids.b12}`).expect(200)).body).toHaveLength(0);
    await http().patch(`/admin/cylinder-types/${ids.b12}`).set(auth('admin')).send({ isActive: true }).expect(200);
    expect(await listed()).toContain(ids.prodA12);
  });

  it('photo du produit : envoyée par son dépôt seulement, servie à tous, contrôlée', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
    const url = `/stores/${ids.storeA}/products/${ids.prodA}/photo`;
    await http().get(`/products/${ids.prodA}/photo`).expect(404);
    // Un autre dépôt ne peut ni envoyer ni retirer la photo (404, comme pour le reste de la boutique)
    await http().put(url).set(auth('supB')).set('Content-Type', 'image/png').send(png).expect(404);
    await http().put(url).set('Content-Type', 'image/png').send(png).expect(401);
    // Contenu qui n'est pas une image, ou type annoncé faux
    await http().put(url).set(auth('supA')).set('Content-Type', 'image/png').send(Buffer.from('<svg onload=alert(1)>')).expect(400);
    await http().put(url).set(auth('supA')).set('Content-Type', 'image/jpeg').send(png).expect(400);

    const put = await http().put(url).set(auth('supA')).set('Content-Type', 'image/png').send(png).expect(200);
    expect(put.body.photoUpdatedAt).toBeTruthy();
    const got = await http().get(`/products/${ids.prodA}/photo`).buffer(true).expect(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(got.body as Buffer, png)).toBe(0);
    // La recherche donne la version de la photo, pour construire son adresse
    const offers = await http().get(`/products?storeId=${ids.storeA}`).expect(200);
    expect(offers.body.find((o: any) => o.id === ids.prodA).photoUpdatedAt).toBe(put.body.photoUpdatedAt);

    await http().delete(url).set(auth('supB')).expect(404);
    await http().delete(url).set(auth('supA')).expect(204);
    await http().get(`/products/${ids.prodA}/photo`).expect(404);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.prodA } })).photoUpdatedAt).toBeNull();
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
    // Page d'un dépôt : ses seules offres commandables (le B12 à stock zéro du dépôt A reste absent)
    res = await http().get(`/products?storeId=${ids.storeA}`).expect(200);
    expect(res.body.map((p: any) => p.id)).toEqual([ids.prodA]);

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
      expect(asSupplier.body.client.phone).toBe('+225' + phones.client); // le dépôt peut joindre le client
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

  it('fiche produit publique, journal d’audit et statistiques réservés à l’admin', async () => {
    const detail = await http().get(`/products/${ids.prodA}`).expect(200); // public
    expect(detail.body.brand.name).toBe('Total');
    expect(detail.body.available).toBe(true);
    expect(detail.body.store.areas.map((a: any) => a.zoneId)).toEqual([ids.cocody]);
    await http().get('/products/00000000-0000-0000-0000-000000000000').expect(404);

    await http().get('/admin/audit-logs').expect(401);
    await http().get('/admin/audit-logs').set(auth('supA')).expect(403);
    await http().get('/admin/stats').set(auth('client')).expect(403);
    const logs = await http().get('/admin/audit-logs?limit=5').set(auth('admin')).expect(200);
    expect(logs.body).toHaveLength(5);
    expect(logs.body[0].actor.phone).toBeDefined();
    const stats = await http().get('/admin/stats').set(auth('admin')).expect(200);
    expect(stats.body.suppliers.APPROVED).toBe(2);
    expect(stats.body.orders.COMPLETED).toBe(2);
    expect(stats.body.completedVolume).toBe(11000 + 7500);
  });

  it('un fournisseur suspendu ne peut plus agir et disparaît de la recherche', async () => {
    const supplier = await prisma.supplier.findFirstOrThrow({ where: { businessName: 'Gaz Yopougon' } });
    await http().post(`/admin/suppliers/${supplier.id}/suspend`).set(auth('admin')).expect(201);
    await http().put(`/stores/${ids.storeB}/products/${ids.prodB}/stock`).set(auth('supB')).send({ quantity: 50 }).expect(403);
    const res = await http().get(`/products?zoneId=${ids.yop}`).expect(200);
    expect(res.body).toHaveLength(0);
    await http().post(`/admin/suppliers/${supplier.id}/approve`).set(auth('admin')).expect(201);
  });

  // ------------------------------------------------------ panier multi-dépôts
  describe('panier multi-dépôts', () => {
    const signed = (body: object) => {
      const raw = JSON.stringify(body);
      const sig = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!).update(raw).digest('hex');
      return http().post('/payments/webhook').set('Content-Type', 'application/json').set('x-igaz-signature', sig).send(raw);
    };
    // Dépôt A livre à Cocody (adresse du client) ; dépôt B est à Yopougon : retrait.
    const cart = (qtyB = 1) => [
      { storeId: ids.storeA, fulfillment: 'DELIVERY', items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }] },
      { storeId: ids.storeB, fulfillment: 'PICKUP', items: [{ productId: ids.prodB, kind: 'PURCHASE', quantity: qtyB }] },
    ];
    const counts = async () => [await prisma.checkout.count(), await prisma.order.count()];

    it('forme du panier : 3 dépôts au plus, pas de doublon, messages en français', async () => {
      await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: 10 }).expect(200);
      await http().put(`/stores/${ids.storeB}/products/${ids.prodB}/stock`).set(auth('supB')).send({ quantity: 10 }).expect(200);
      const fake = () => ({ storeId: randomUUID(), fulfillment: 'PICKUP', items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }] });
      const tooMany = await http().post('/checkouts').set(auth('client')).send({
        paymentMethod: 'MOBILE_MONEY', stores: [fake(), fake(), fake(), fake()],
      }).expect(400);
      expect(tooMany.body.message).toBe('Un panier peut contenir au plus 3 dépôts');
      await http().post('/checkouts').set(auth('client')).send({
        paymentMethod: 'MOBILE_MONEY', addressId: ids.addr, stores: [cart()[0], cart()[0]],
      }).expect(400);
      await http().post('/checkouts').set(auth('client')).send({ paymentMethod: 'MOBILE_MONEY', stores: [] }).expect(400);
      await http().post('/checkouts').set(auth('supA')).send({ paymentMethod: 'MOBILE_MONEY', addressId: ids.addr, stores: cart() }).expect(403);
    });

    it('tout ou rien : un dépôt en défaut bloque tout le panier, et le message le nomme', async () => {
      const before = await counts();
      const stock = await http().post('/checkouts').set(auth('client')).send({
        paymentMethod: 'MOBILE_MONEY', addressId: ids.addr, stores: cart(50),
      }).expect(409);
      expect(stock.body.message).toMatch(/^Dépôt B : Stock insuffisant/);
      // Dépôt B ne livre pas à Cocody
      const zone = await http().post('/checkouts').set(auth('client')).send({
        paymentMethod: 'MOBILE_MONEY', addressId: ids.addr, stores: [cart()[0], { ...cart()[1], fulfillment: 'DELIVERY' }],
      }).expect(422);
      expect(zone.body.message).toBe('Dépôt B : Cette boutique ne livre pas dans votre zone');
      // Livraison sans adresse
      await http().post('/checkouts').set(auth('client')).send({ paymentMethod: 'MOBILE_MONEY', stores: cart() }).expect(400);
      expect(await counts()).toEqual(before); // rien n'a été créé, pas même la commande du dépôt A
    });

    it('une commande par dépôt, cloisonnées ; le panier se paie en une fois, jamais commande par commande', async () => {
      const res = await http().post('/checkouts').set(auth('client')).send({
        paymentMethod: 'MOBILE_MONEY', addressId: ids.addr, stores: cart(),
      }).expect(201);
      const ck = res.body;
      ids.checkout = ck.id;
      expect(ck.code).toMatch(/^PN-[0-9A-F]{8}$/);
      expect(ck.orders).toHaveLength(2);
      const [a, b] = ck.orders;
      ids.ckA = a.id; ids.ckB = b.id;
      expect(a.storeId).toBe(ids.storeA);
      expect(b.storeId).toBe(ids.storeB);
      expect([a.status, b.status]).toEqual(['PENDING_PAYMENT', 'PENDING_PAYMENT']);
      expect(a.total).toBe(7500 + 500); // frais de livraison du dépôt A
      expect(b.total).toBe(7000); // retrait : pas de frais
      expect(ck.total).toBe(15000);
      expect(a.confirmationCode).toMatch(/^\d{6}$/);
      expect(b.confirmationCode).toMatch(/^\d{6}$/);
      expect(a.code).not.toBe(b.code);

      // Cloisonnement : chaque dépôt ne voit que sa commande, sans le panier ni le code client
      const asA = await http().get(`/orders/${a.id}`).set(auth('supA')).expect(200);
      expect(asA.body.checkout).toBeUndefined();
      expect(asA.body.confirmationCode).toBeUndefined();
      await http().get(`/orders/${b.id}`).set(auth('supA')).expect(404);
      const listB = await http().get('/orders').set(auth('supB')).expect(200);
      expect(listB.body.map((o: any) => o.id)).not.toContain(a.id);
      await http().get(`/checkouts/${ck.id}`).set(auth('client2')).expect(404);
      await http().get(`/checkouts/${ck.id}`).set(auth('supA')).expect(403);
      const mine = await http().get(`/checkouts/${ck.id}`).set(auth('client')).expect(200);
      expect(mine.body.orders.map((o: any) => o.id)).toEqual([a.id, b.id]);

      // Non payées : les dépôts ne peuvent pas accepter ; pas de paiement commande par commande
      await http().post(`/orders/${a.id}/accept`).set(auth('supA')).expect(409);
      await http().post(`/orders/${a.id}/payments`).set(auth('client')).send({ idempotencyKey: 'commande-seule-01' }).expect(409);
    });

    it('paiement unique : idempotent, confirmé par le webhook pour toutes les commandes, rejeu sans effet', async () => {
      const k = 'panier-cle-000001';
      const p1 = await http().post(`/checkouts/${ids.checkout}/payments`).set(auth('client')).send({ idempotencyKey: k }).expect(200);
      const p2 = await http().post(`/checkouts/${ids.checkout}/payments`).set(auth('client')).send({ idempotencyKey: k }).expect(200);
      const p3 = await http().post(`/checkouts/${ids.checkout}/payments`).set(auth('client')).send({ idempotencyKey: 'panier-cle-000002' }).expect(200);
      expect(p1.body.amount).toBe(15000);
      expect(p2.body.id).toBe(p1.body.id);
      expect(p3.body.id).toBe(p1.body.id);
      expect(await prisma.payment.count({ where: { checkoutId: ids.checkout } })).toBe(1);
      await http().post(`/checkouts/${ids.checkout}/payments`).set(auth('client2')).send({ idempotencyKey: 'pirate-panier-01' }).expect(404);

      const payload = { reference: p1.body.id, status: 'SUCCEEDED', amount: 15000, providerRef: 'WAVE-PANIER-1' };
      await signed({ ...payload, amount: 8000 }).expect(400); // montant d'une seule commande : refusé
      await signed(payload).expect(200);
      expect((await signed(payload).expect(200)).body.duplicate).toBe(true);

      for (const id of [ids.ckA, ids.ckB]) {
        const o = await http().get(`/orders/${id}`).set(auth('client')).expect(200);
        expect(o.body.status).toBe('SUBMITTED');
        expect(o.body.paidOnline).toBe(true);
        expect(o.body.events.filter((e: any) => e.status === 'SUBMITTED')).toHaveLength(1);
      }
      await http().post(`/checkouts/${ids.checkout}/payments`).set(auth('client')).send({ idempotencyKey: 'panier-cle-000003' }).expect(409);
    });

    it('un dépôt qui refuse n’affecte pas l’autre ; la part refusée est signalée payée (remboursement)', async () => {
      await http().post(`/orders/${ids.ckA}/accept`).set(auth('supA')).expect(200);
      await http().post(`/orders/${ids.ckB}/reject`).set(auth('supB')).send({ reason: 'Plus de stock' }).expect(200);
      expect((await prisma.order.findUnique({ where: { id: ids.ckA } }))!.status).toBe('ACCEPTED');
      const refused = await http().get(`/orders/${ids.ckB}`).set(auth('admin')).expect(200);
      expect(refused.body.status).toBe('REJECTED');
      expect(refused.body.paidOnline).toBe(true); // l'admin voit qu'un remboursement est à traiter
      expect(refused.body.checkout.code).toMatch(/^PN-/);
    });

    it('une commande annulée avant le paiement n’est pas facturée', async () => {
      const res = await http().post('/checkouts').set(auth('client')).send({
        paymentMethod: 'MOBILE_MONEY', addressId: ids.addr, stores: cart(),
      }).expect(201);
      const [a, b] = res.body.orders;
      await http().post(`/orders/${b.id}/cancel`).set(auth('client')).expect(200);
      const p = await http().post(`/checkouts/${res.body.id}/payments`).set(auth('client')).send({ idempotencyKey: 'panier-annule-001' }).expect(200);
      expect(p.body.amount).toBe(a.total);
      await signed({ reference: p.body.id, status: 'SUCCEEDED', amount: a.total, providerRef: 'WAVE-PANIER-2' }).expect(200);
      expect((await prisma.order.findUnique({ where: { id: a.id } }))!.status).toBe('SUBMITTED');
      expect((await prisma.order.findUnique({ where: { id: b.id } }))!.status).toBe('CANCELLED');
      expect(await prisma.orderEvent.count({ where: { orderId: b.id, note: { contains: 'remboursement' } } })).toBe(0);
    });

    it('paiement à la livraison : chaque dépôt encaisse sa commande, rien à payer en ligne', async () => {
      const res = await http().post('/checkouts').set(auth('client')).send({
        paymentMethod: 'CASH_ON_DELIVERY', addressId: ids.addr, stores: cart(),
      }).expect(201);
      expect(res.body.orders.map((o: any) => o.status)).toEqual(['SUBMITTED', 'SUBMITTED']);
      for (const o of res.body.orders) {
        expect(o.payments).toHaveLength(1);
        expect(o.payments[0]).toMatchObject({ method: 'CASH_ON_DELIVERY', amount: o.total, status: 'PENDING' });
      }
      await http().post(`/checkouts/${res.body.id}/payments`).set(auth('client')).send({ idempotencyKey: 'panier-especes-01' }).expect(409);
    });
  });

  // -------------------------------------------------- compte et adresses (Play Store)
  describe('notifications', () => {
    const keys = { p256dh: 'BPcleTestP256dh', auth: 'authTest' };
    const mine = async (who: string) => (await http().get('/notifications').set(auth(who)).expect(200)).body;

    it('nouvelle commande : le dépôt est prévenu dans l’application, en push et par SMS si activé ; pas l’autre dépôt', async () => {
      await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: 10 }).expect(200);
      expect((await http().get('/notifications/push-key').expect(200)).body.publicKey).toBe('cle-publique-de-test');
      await http().post('/notifications/push-subscriptions').set(auth('supA'))
        .send({ endpoint: 'http://non-securise.test/x', keys }).expect(400);
      await http().post('/notifications/push-subscriptions').set(auth('supA'))
        .send({ endpoint: 'https://push.test/supA', keys }).expect(204);
      await http().post('/notifications/push-subscriptions').expect(401);

      process.env.NOTIFY_SUPPLIER_BY_SMS = 'true';
      const res = await http().post('/orders').set(auth('client')).send({
        storeId: ids.storeA, fulfillment: 'PICKUP', paymentMethod: 'CASH_ON_DELIVERY',
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(201);
      delete process.env.NOTIFY_SUPPLIER_BY_SMS;
      ids.notifOrder = res.body.id;

      const a = await mine('supA');
      expect(a.unread).toBeGreaterThan(0);
      expect(a.items[0]).toMatchObject({ kind: 'ORDER_NEW', orderId: res.body.id, url: '/fournisseur#commandes', readAt: null });
      expect(a.items[0].title).toBe(`Nouvelle commande #${res.body.code}`);
      expect(a.items[0].body).toContain('retrait au dépôt');
      expect(push.sent.some((s) => s.endpoint === 'https://push.test/supA' && s.payload.title.includes(res.body.code))).toBe(true);
      expect(sms.messages.some((m) => m.message.includes(res.body.code))).toBe(true);
      expect((await mine('supB')).items.some((n: any) => n.orderId === res.body.id)).toBe(false);
      // Le code de remise du client n'apparaît dans aucune notification du dépôt
      expect(a.items.every((n: any) => !`${n.title} ${n.body}`.includes(res.body.confirmationCode))).toBe(true);
    });

    it('chaque étape prévient le client ; marquer comme lu', async () => {
      await http().post('/notifications/read-all').set(auth('client')).expect(204);
      expect((await mine('client')).unread).toBe(0);
      const id = ids.notifOrder;
      await http().post(`/orders/${id}/accept`).set(auth('supA')).expect(200);
      await http().post(`/orders/${id}/ready`).set(auth('supA')).expect(200);
      const code = (await prisma.order.findUniqueOrThrow({ where: { id } })).confirmationCode;
      await http().post(`/orders/${id}/complete`).set(auth('supA')).send({ code }).expect(200);

      const c = await mine('client');
      expect(c.unread).toBe(3);
      expect(c.items.slice(0, 3).map((n: any) => n.kind)).toEqual(['ORDER_COMPLETED', 'ORDER_READY', 'ORDER_ACCEPTED']);
      expect(c.items[0].url).toBe(`/commandes/${id}`);

      // Un autre utilisateur ne peut pas marquer mes notifications comme lues
      await http().post(`/notifications/${c.items[0].id}/read`).set(auth('client2')).expect(204);
      expect((await mine('client')).unread).toBe(3);
      await http().post(`/notifications/${c.items[0].id}/read`).set(auth('client')).expect(204);
      expect((await mine('client')).unread).toBe(2);
      await http().post('/notifications/read-all').set(auth('client')).expect(204);
      expect((await mine('client')).unread).toBe(0);
    });

    it('mobile money : le dépôt n’est prévenu qu’à la confirmation du paiement ; abonnement push expiré supprimé', async () => {
      await http().put(`/stores/${ids.storeB}/products/${ids.prodB}/stock`).set(auth('supB')).send({ quantity: 10 }).expect(200);
      await http().post('/notifications/push-subscriptions').set(auth('supB')).send({ endpoint: 'https://push.test/gone', keys }).expect(204);
      const addr = (await http().get('/addresses').set(auth('client2')).expect(200)).body[0];
      const o = await http().post('/orders').set(auth('client2')).send({
        storeId: ids.storeB, fulfillment: 'DELIVERY', paymentMethod: 'MOBILE_MONEY', addressId: addr.id,
        items: [{ productId: ids.prodB, kind: 'PURCHASE', quantity: 1 }],
      }).expect(201);
      expect((await mine('supB')).items.some((n: any) => n.orderId === o.body.id)).toBe(false);

      const p = await http().post(`/orders/${o.body.id}/payments`).set(auth('client2')).send({ idempotencyKey: 'notif-paiement-01' }).expect(200);
      const raw = JSON.stringify({ reference: p.body.id, status: 'SUCCEEDED', amount: p.body.amount, providerRef: 'WAVE-NOTIF-1' });
      const sig = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!).update(raw).digest('hex');
      await http().post('/payments/webhook').set('Content-Type', 'application/json').set('x-igaz-signature', sig).send(raw).expect(200);

      const b = await mine('supB');
      expect(b.items.find((n: any) => n.orderId === o.body.id)).toMatchObject({ kind: 'ORDER_NEW' });
      expect(b.items.find((n: any) => n.orderId === o.body.id).body).toContain('déjà payé');
      expect(await prisma.pushSubscription.count({ where: { endpoint: 'https://push.test/gone' } })).toBe(0);
    });
  });

  describe('rémunération iGaz', () => {
    it('réglages : admin seulement, bornés, audités ; frais publics pour le client', async () => {
      await login('admin');
      await http().patch('/admin/revenue/settings').set(auth('supA')).send({ serviceFee: 100 }).expect(403);
      await http().patch('/admin/revenue/settings').set(auth('admin')).send({ serviceFee: 99999 }).expect(400);
      await http().patch('/admin/revenue/settings').set(auth('admin')).send({ serviceFee: 2.5 }).expect(400);
      const res = await http().patch('/admin/revenue/settings').set(auth('admin')).send({ serviceFee: 100, deliveryShare: 150 }).expect(200);
      expect(res.body).toEqual({ serviceFee: 100, deliveryShare: 150 });
      expect(await prisma.auditLog.count({ where: { action: 'FEES_UPDATE' } })).toBeGreaterThan(0);
      expect((await http().get('/catalog/fees').expect(200)).body).toEqual({ serviceFee: 100 });
    });

    it('frais figés sur la commande, relevé du dépôt, commandes non terminées exclues, règlement d’un mois terminé', async () => {
      await login('client');
      await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: 10 }).expect(200);
      const before = (await http().get(`/stores/${ids.storeA}/statement`).set(auth('supA')).expect(200)).body;
      await http().get(`/stores/${ids.storeA}/statement`).set(auth('supB')).expect(404); // cloisonnement
      await http().get('/admin/revenue').set(auth('supA')).expect(403);

      const body = {
        storeId: ids.storeA, fulfillment: 'DELIVERY', paymentMethod: 'CASH_ON_DELIVERY', addressId: ids.addr,
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      };
      const order = (await http().post('/orders').set(auth('client')).send(body).expect(201)).body;
      expect(order.serviceFee).toBe(100);
      expect(order.total).toBe(order.subtotal + 500 + 100); // livraison du dépôt A : 500 F
      expect(order.platformShare).toBeUndefined(); // affaire entre le dépôt et iGaz
      const forDepot = (await http().get(`/orders/${order.id}`).set(auth('supA')).expect(200)).body;
      expect(forDepot.platformShare).toBe(150);
      expect(forDepot.payments[0].amount).toBe(order.total); // le dépôt encaisse tout, frais compris

      // Une commande annulée ne coûte rien à personne
      const cancelled = (await http().post('/orders').set(auth('client')).send(body).expect(201)).body;
      await http().post(`/orders/${cancelled.id}/cancel`).set(auth('client')).expect(200);

      // Nouveau réglage : sans effet sur la commande déjà passée
      await http().patch('/admin/revenue/settings').set(auth('admin')).send({ serviceFee: 300 }).expect(200);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).serviceFee).toBe(100);

      // En cours : hors relevé ; terminée (code client) : dans le relevé
      await http().post(`/orders/${order.id}/accept`).set(auth('supA')).expect(200);
      let now = (await http().get(`/stores/${ids.storeA}/statement`).set(auth('supA')).expect(200)).body;
      expect(now.orders).toBe(before.orders);
      await http().post(`/orders/${order.id}/dispatch`).set(auth('supA')).expect(200);
      await http().post(`/orders/${order.id}/complete`).set(auth('supA')).send({ code: order.confirmationCode }).expect(200);
      now = (await http().get(`/stores/${ids.storeA}/statement`).set(auth('supA')).expect(200)).body;
      expect(now.orders).toBe(before.orders + 1);
      expect(now.serviceFees - before.serviceFees).toBe(100);
      expect(now.deliveryShares - before.deliveryShares).toBe(150);
      expect(now.balance - before.balance).toBe(250); // espèces : le dépôt doit 100 + 150 F à iGaz
      expect(now.lines.find((l: any) => l.id === order.id)).toMatchObject({ depotOwes: 250, platformOwes: 0 });

      // Mois en cours : pas encore réglable
      const month = now.month as string;
      await http().post(`/admin/revenue/stores/${ids.storeA}/${month}/settle`).set(auth('admin')).send({}).expect(422);

      // Mois terminé (remise datée du mois dernier) : réglé une fois, pour le solde calculé, avec audit
      const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 15));
      await prisma.orderEvent.updateMany({ where: { orderId: order.id, status: 'COMPLETED' }, data: { createdAt: lastMonth } });
      const past = lastMonth.toISOString().slice(0, 7);
      const statementPast = (await http().get(`/admin/revenue/stores/${ids.storeA}?month=${past}`).set(auth('admin')).expect(200)).body;
      expect(statementPast.orders).toBe(1);
      const admin = (await http().get(`/admin/revenue?month=${past}`).set(auth('admin')).expect(200)).body;
      expect(admin.revenue).toBe(250);
      expect(admin.stores.map((s: any) => s.store.id)).toEqual([ids.storeA]);
      await http().post(`/admin/revenue/stores/${ids.storeA}/${past}/settle`).set(auth('supA')).send({}).expect(403);
      const settled = await http().post(`/admin/revenue/stores/${ids.storeA}/${past}/settle`).set(auth('admin')).send({ note: 'Wave 12/11' }).expect(201);
      expect(settled.body.amount).toBe(250);
      await http().post(`/admin/revenue/stores/${ids.storeA}/${past}/settle`).set(auth('admin')).send({}).expect(409);
      await http().post(`/admin/revenue/stores/${ids.storeB}/${past}/settle`).set(auth('admin')).send({}).expect(422); // rien à régler
      expect(await prisma.auditLog.count({ where: { action: 'SETTLEMENT', entityId: ids.storeA } })).toBe(1);
      const seen = (await http().get(`/stores/${ids.storeA}/statement?month=${past}`).set(auth('supA')).expect(200)).body;
      expect(seen.settlement.amount).toBe(250);

      // Retour à « pas de frais » pour la suite des tests
      await http().patch('/admin/revenue/settings').set(auth('admin')).send({ serviceFee: 0, deliveryShare: 0 }).expect(200);
    });
  });

  describe('avis et notes', () => {
    const reviews: Record<string, any> = {};
    // Comptes déjà connectés plus haut : on réutilise leur jeton (la limite anti-abus des codes SMS refuserait un nouveau code).
    const ensure = async (who: keyof typeof phones) => { if (!tokens[who]) await login(who); };
    /** Commande du client chez le dépôt A, menée jusqu'à la remise (code du client). */
    async function completedOrder() {
      await http().put(`/stores/${ids.storeA}/products/${ids.prodA}/stock`).set(auth('supA')).send({ quantity: 10 }).expect(200);
      const o = (await http().post('/orders').set(auth('client')).send({
        storeId: ids.storeA, fulfillment: 'DELIVERY', paymentMethod: 'CASH_ON_DELIVERY', addressId: ids.addr,
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(201)).body;
      await http().post(`/orders/${o.id}/accept`).set(auth('supA')).expect(200);
      await http().post(`/orders/${o.id}/dispatch`).set(auth('supA')).expect(200);
      await http().post(`/orders/${o.id}/complete`).set(auth('supA')).send({ code: o.confirmationCode }).expect(200);
      return o;
    }

    it('seul le client d’une commande terminée note, une fois ; moyenne à partir de 3 avis ; 30 jours', async () => {
      await ensure('client');
      const base = await prisma.store.findUniqueOrThrow({ where: { id: ids.storeA } });
      // Pas encore remise : pas d'avis
      const pending = (await http().post('/orders').set(auth('client')).send({
        storeId: ids.storeA, fulfillment: 'DELIVERY', paymentMethod: 'CASH_ON_DELIVERY', addressId: ids.addr,
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(201)).body;
      await http().put(`/orders/${pending.id}/review`).set(auth('client')).send({ rating: 5 }).expect(409);
      await http().post(`/orders/${pending.id}/cancel`).set(auth('client')).expect(200);

      const o1 = await completedOrder();
      await ensure('client2');
      await http().put(`/orders/${o1.id}/review`).set(auth('client2')).send({ rating: 1 }).expect(404); // pas sa commande
      await http().put(`/orders/${o1.id}/review`).set(auth('supA')).send({ rating: 5 }).expect(403);
      await http().put(`/orders/${o1.id}/review`).set(auth('client')).send({ rating: 6 }).expect(400);
      await http().put(`/orders/${o1.id}/review`).set(auth('client')).send({ rating: 4.5 }).expect(400);

      const r1 = await http().put(`/orders/${o1.id}/review`).set(auth('client')).send({ rating: 4, comment: '  Rapide   et poli ' }).expect(200);
      expect(r1.body.comment).toBe('Rapide et poli');
      reviews.first = r1.body;
      // Modification : toujours un seul avis, moyenne corrigée
      await http().put(`/orders/${o1.id}/review`).set(auth('client')).send({ rating: 2 }).expect(200);
      expect(await prisma.review.count({ where: { orderId: o1.id } })).toBe(1);
      let store = await prisma.store.findUniqueOrThrow({ where: { id: ids.storeA } });
      expect([store.ratingCount - base.ratingCount, store.ratingSum - base.ratingSum]).toEqual([1, 2]);
      // Le dépôt est prévenu (une fois, pas à la modification)
      const supA = await prisma.user.findUniqueOrThrow({ where: { phone: '+225' + phones.supA } });
      expect(await prisma.notification.count({ where: { userId: supA.id, kind: 'REVIEW_NEW' } })).toBe(1);

      // Public : moins de 3 avis → pas de moyenne ; auteur réduit, jamais de numéro
      let pub = (await http().get(`/stores/${ids.storeA}/reviews`).expect(200)).body;
      expect(pub.rating).toEqual({ count: 1, average: null });
      expect(pub.reviews[0].rating).toBe(2);
      expect(pub.reviews[0].author).toMatch(/^client$/i); // compte de test sans nom de famille
      expect(JSON.stringify(pub)).not.toContain(phones.client.slice(1));
      expect(pub.reviews[0].clientId).toBeUndefined();

      for (const rating of [5, 5]) {
        const o = await completedOrder();
        await http().put(`/orders/${o.id}/review`).set(auth('client')).send({ rating }).expect(200);
      }
      pub = (await http().get(`/stores/${ids.storeA}/reviews`).expect(200)).body;
      expect(pub.rating).toEqual({ count: 3, average: 4 }); // (2 + 5 + 5) / 3
      const offers = (await http().get(`/products?storeId=${ids.storeA}`).expect(200)).body;
      expect(offers[0].store.rating).toEqual({ count: 3, average: 4 });
      expect(offers[0].store.ratingSum).toBeUndefined();

      // Plus de 30 jours après la remise : trop tard
      const late = await completedOrder();
      await prisma.orderEvent.updateMany({ where: { orderId: late.id, status: 'COMPLETED' }, data: { createdAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) } });
      await http().put(`/orders/${late.id}/review`).set(auth('client')).send({ rating: 1 }).expect(422);
      // L'avis apparaît sur la commande du client
      expect((await http().get(`/orders/${o1.id}`).set(auth('client')).expect(200)).body.review.rating).toBe(2);
    });

    it('réponse du dépôt cloisonnée et unique ; masquage par l’admin audité et retiré de la moyenne', async () => {
      const id = reviews.first.id;
      await http().get(`/stores/${ids.storeA}/reviews/mine`).set(auth('supB')).expect(404);
      await http().put(`/stores/${ids.storeA}/reviews/${id}/reply`).set(auth('supB')).send({ reply: 'Merci' }).expect(404);
      await http().put(`/stores/${ids.storeB}/reviews/${id}/reply`).set(auth('supB')).send({ reply: 'Merci' }).expect(404);
      await http().put(`/stores/${ids.storeA}/reviews/${id}/reply`).set(auth('supA')).send({ reply: '  Merci, à bientôt  ' }).expect(200);
      await http().put(`/stores/${ids.storeA}/reviews/${id}/reply`).set(auth('supA')).send({ reply: 'Encore' }).expect(409);
      const client = await prisma.user.findUniqueOrThrow({ where: { phone: '+225' + phones.client } });
      expect(await prisma.notification.count({ where: { userId: client.id, kind: 'REVIEW_REPLY' } })).toBe(1);
      let pub = (await http().get(`/stores/${ids.storeA}/reviews`).expect(200)).body;
      expect(pub.reviews.find((r: any) => r.id === id).reply).toBe('Merci, à bientôt');

      await ensure('admin');
      await http().patch(`/admin/reviews/${id}`).set(auth('supA')).send({ hidden: true }).expect(403);
      await http().patch(`/admin/reviews/${id}`).set(auth('admin')).send({ hidden: true, reason: 'Numéro de téléphone' }).expect(200);
      expect(await prisma.auditLog.count({ where: { action: 'REVIEW_HIDDEN', entityId: id } })).toBe(1);
      pub = (await http().get(`/stores/${ids.storeA}/reviews`).expect(200)).body;
      expect(pub.reviews.map((r: any) => r.id)).not.toContain(id);
      expect(pub.rating).toEqual({ count: 2, average: null }); // sous le seuil
      const mine = (await http().get(`/stores/${ids.storeA}/reviews/mine`).set(auth('supA')).expect(200)).body;
      expect(mine.reviews.find((r: any) => r.id === id).hidden).toBe(true);
      // Masquer deux fois ne décompte qu'une fois ; réafficher rétablit la moyenne
      await http().patch(`/admin/reviews/${id}`).set(auth('admin')).send({ hidden: true }).expect(200);
      await http().patch(`/admin/reviews/${id}`).set(auth('admin')).send({ hidden: false }).expect(200);
      pub = (await http().get(`/stores/${ids.storeA}/reviews`).expect(200)).body;
      expect(pub.rating).toEqual({ count: 3, average: 4 });
      expect((await http().get('/admin/reviews').set(auth('admin')).expect(200)).body.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('prénom et nom', () => {
    it('inscription avec prénom et nom, mis en forme ; les deux sont requis ensemble', async () => {
      const phone = '0701000044';
      await http().post('/auth/otp/request').send({ phone }).expect(200);
      let code = sms.last.get('+225' + phone)!;
      await http().post('/auth/otp/verify').send({ phone, code, firstName: 'Awa' }).expect(400);
      await http().post('/auth/otp/verify').send({ phone, code, firstName: 'Awa2', lastName: 'Koné' }).expect(400);
      // Le code n'a pas été consommé par les refus de validation : on peut le réutiliser
      const ok = await http().post('/auth/otp/verify').send({ phone, code, firstName: '  awa ', lastName: 'KONÉ' }).expect(200);
      expect(ok.body.user.name).toBe('Awa Koné');
      tokens.awa = ok.body.accessToken;

      // Reconnexion sans nom : le nom enregistré est conservé
      await http().post('/auth/otp/request').send({ phone }).expect(200);
      code = sms.last.get('+225' + phone)!;
      const again = await http().post('/auth/otp/verify').send({ phone, code }).expect(200);
      expect(again.body.user.name).toBe('Awa Koné');
    });

    it('modifier son prénom et son nom', async () => {
      const res = await http().patch('/auth/me').set(auth('awa')).send({ firstName: "n'guessan", lastName: 'kouassi-traoré' }).expect(200);
      expect(res.body.name).toBe("N'Guessan Kouassi-Traoré");
      expect((await http().get('/auth/me').set(auth('awa')).expect(200)).body.name).toBe("N'Guessan Kouassi-Traoré");
      const bad = await http().patch('/auth/me').set(auth('awa')).send({ firstName: '<b>', lastName: 'X' }).expect(400);
      expect(String(bad.body.message)).toMatch(/lettres/);
      await http().patch('/auth/me').send({ firstName: 'A', lastName: 'B' }).expect(401);
    });
  });

  describe('adresses et suppression de compte', () => {
    it('le client gère ses adresses ; personne d’autre ne peut les modifier', async () => {
      await login('client3');
      const a = await http().post('/addresses').set(auth('client3')).send({ zoneId: ids.cocody, details: 'Riviera 2, villa 12' }).expect(201);
      expect(a.body.label).toBe('Domicile');
      const up = await http().patch(`/addresses/${a.body.id}`).set(auth('client3'))
        .send({ label: 'Bureau', zoneId: ids.yop, details: 'Siporex, immeuble B' }).expect(200);
      expect(up.body).toMatchObject({ label: 'Bureau', zoneId: ids.yop, details: 'Siporex, immeuble B' });
      expect(up.body.zone.name).toBe('Yopougon');
      await http().patch(`/addresses/${a.body.id}`).set(auth('client')).send({ label: 'Pirate' }).expect(404);
      await http().delete(`/addresses/${a.body.id}`).set(auth('client')).expect(404);
      await http().patch(`/addresses/${a.body.id}`).set(auth('client3')).send({ zoneId: randomUUID() }).expect(400);
      await http().delete(`/addresses/${a.body.id}`).set(auth('client3')).expect(204);
      expect((await http().get('/addresses').set(auth('client3')).expect(200)).body).toHaveLength(0);
    });

    it('suppression refusée tant qu’une commande est en cours, et pour l’administrateur', async () => {
      const busy = await http().delete('/auth/me').set(auth('client')).expect(409);
      expect(busy.body.message).toMatch(/commandes? en cours/);
      await http().delete('/auth/me').set(auth('supB')).expect(409); // commandes en cours dans sa boutique
      await http().delete('/auth/me').set(auth('admin')).expect(409);
      await http().delete('/auth/me').expect(401);
    });

    it('suppression : compte anonymisé, jeton refusé, commandes gardées sans identité, numéro réutilisable', async () => {
      const addr = await http().post('/addresses').set(auth('client3')).send({ zoneId: ids.cocody, details: 'Angré, chez Awa' }).expect(201);
      const o = await http().post('/orders').set(auth('client3')).send({
        storeId: ids.storeA, fulfillment: 'DELIVERY', paymentMethod: 'CASH_ON_DELIVERY', addressId: addr.body.id,
        items: [{ productId: ids.prodA, kind: 'PURCHASE', quantity: 1 }],
      }).expect(201);
      await http().post(`/orders/${o.body.id}/cancel`).set(auth('client3')).expect(200);
      const before = await prisma.user.findUniqueOrThrow({ where: { phone: '+225' + phones.client3 } });

      await http().delete('/auth/me').set(auth('client3')).expect(204);
      await http().get('/auth/me').set(auth('client3')).expect(401);

      const gone = await prisma.user.findUniqueOrThrow({ where: { id: before.id } });
      expect(gone).toMatchObject({ phone: `supprime:${before.id}`, name: null, isActive: false });
      expect(await prisma.address.count({ where: { userId: before.id } })).toBe(0);
      const kept = await prisma.order.findUniqueOrThrow({ where: { id: o.body.id } });
      expect(kept.clientId).toBe(before.id);
      expect(kept.deliveryDetails).toBeNull();
      expect(await prisma.auditLog.count({ where: { action: 'ACCOUNT_DELETED', entityId: before.id } })).toBe(1);

      // Le même numéro recrée un compte neuf, sans l'historique de l'ancien.
      await login('client3');
      const me = await http().get('/auth/me').set(auth('client3')).expect(200);
      expect(me.body.id).not.toBe(before.id);
      expect((await http().get('/orders').set(auth('client3')).expect(200)).body).toHaveLength(0);
    });

    it('un vendeur sans commande en cours peut supprimer son compte : fournisseur suspendu, boutiques fermées', async () => {
      await login('supC');
      await http().post('/suppliers/register').set(auth('supC')).send({ businessName: 'Dépôt à fermer' }).expect(201);
      const supplier = await prisma.supplier.findFirstOrThrow({ where: { businessName: 'Dépôt à fermer' } });
      await http().post(`/admin/suppliers/${supplier.id}/approve`).set(auth('admin')).expect(201);
      await http().post('/suppliers/me/stores').set(auth('supC')).send({
        name: 'Dépôt C', address: 'Bingerville centre', phone: '0733445566', zoneIds: [ids.cocody],
      }).expect(201);
      await http().delete('/auth/me').set(auth('supC')).expect(204);
      expect((await prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } })).status).toBe('SUSPENDED');
      expect(await prisma.store.count({ where: { supplierId: supplier.id, isOpen: true } })).toBe(0);
    });
  });
});
