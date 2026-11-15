import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { fromPaystackAmount, PaystackClient, paystackConfigFromEnv, toPaystackAmount } from './paystack';

function fakePaystack(reply: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = reply(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { http, calls };
}

const config = { secretKey: 'sk_test_abc', customerEmail: 'client-{id}@igaz.ci' };

describe('Paystack', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('montants XOF : ×100 à l’aller (règle Paystack), ÷100 au retour, toujours entiers', () => {
    expect(toPaystackAmount(2300)).toBe(230000);
    expect(fromPaystackAmount(230000)).toBe(2300);
    expect(fromPaystackAmount(230099)).toBe(2300);
  });

  it('crée la page de paiement : XOF, référence = paiement iGaz, mobile money et carte, clé secrète en en-tête', async () => {
    const { http, calls } = fakePaystack(() => ({ status: 200, body: { status: true, data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'r', access_code: 'a' } } }));
    const client = new PaystackClient(config, http);
    const ref = '0b0c1e2f-1111-4222-8333-444455556666';
    const r = await client.initialize({ reference: ref, amount: 2300, callbackUrl: 'https://app/commandes/1', metadata: { orderId: '1' } });
    expect(r.url).toBe('https://checkout.paystack.com/x');
    expect(calls[0].url).toBe('https://api.paystack.co/transaction/initialize');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_abc');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: 'client-0b0c1e2f@igaz.ci', amount: 230000, currency: 'XOF', reference: ref,
      callback_url: 'https://app/commandes/1', channels: ['mobile_money', 'card'], metadata: { orderId: '1' },
    });
    expect(client.testMode).toBe(true);
  });

  it('contre-vérification d’une transaction', async () => {
    const { http, calls } = fakePaystack(() => ({ status: 200, body: { status: true, data: { status: 'success', amount: 230000, currency: 'XOF', id: 99, reference: 'r' } } }));
    expect(await new PaystackClient(config, http).verify('r')).toEqual({ succeeded: true, amount: 2300, currency: 'XOF', providerRef: '99' });
    expect(calls[0].url).toBe('https://api.paystack.co/transaction/verify/r');
  });

  it('refus ou panne de Paystack : message clair pour le client', async () => {
    const { http } = fakePaystack(() => ({ status: 401, body: { status: false, message: 'Invalid key' } }));
    await expect(new PaystackClient(config, http).verify('r')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('signature HMAC-SHA512 du corps brut, avec la clé de webhook ou la clé secrète ; sinon refusée', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const sign = (key: string) => createHmac('sha512', key).update(body).digest('hex');
    const client = new PaystackClient({ ...config, webhookSecret: 'whsec_x' }, fetch);
    expect(client.signatureValid(body, sign('whsec_x'))).toBe(true);
    expect(client.signatureValid(body, sign('sk_test_abc'))).toBe(true);
    expect(client.signatureValid(body, sign('autre-cle'))).toBe(false);
    expect(client.signatureValid(Buffer.from('{"event":"falsifie"}'), sign('whsec_x'))).toBe(false);
    expect(client.signatureValid(body, undefined)).toBe(false);
    expect(client.signatureValid(body, 'pas-hexa')).toBe(false);
  });

  it('configuration : sans clé, pas de paiement en ligne réel', () => {
    expect(paystackConfigFromEnv({})).toBeNull();
    expect(paystackConfigFromEnv({ PAYSTACK_SECRET_KEY: 'sk_test_x' })).toMatchObject({ secretKey: 'sk_test_x', customerEmail: 'client-{id}@igaz.ci' });
  });
});
