import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { OrangeSmsProvider, orangeConfigFromEnv } from './orange-sms.provider';

/** Faux serveur Orange : enregistre les appels et répond selon le scénario donné. */
function fakeOrange(responses: Array<{ status: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const isToken = url.endsWith('/oauth/v3/token');
    const r = isToken ? { status: 200, body: { access_token: `tok${calls.filter((c) => c.url.endsWith('/token')).length}`, expires_in: '3600' } } : responses.shift()!;
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { http, calls };
}

const config = { clientId: 'id', clientSecret: 'secret', senderAddress: 'tel:+2250000' };

describe('SMS Orange', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('obtient un jeton puis envoie le SMS au format Orange', async () => {
    const { http, calls } = fakeOrange([{ status: 201, body: { outboundSMSMessageRequest: {} } }]);
    await new OrangeSmsProvider({ ...config, senderName: 'iGaz CI' }, http).send('+2250701020304', 'Votre code est 123456');

    expect(calls[0].url).toBe('https://api.orange.com/oauth/v3/token');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
    expect(calls[0].init.body).toBe('grant_type=client_credentials');

    expect(calls[1].url).toBe('https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2250000/requests');
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer tok1');
    expect(JSON.parse(calls[1].init.body as string)).toEqual({
      outboundSMSMessageRequest: {
        address: 'tel:+2250701020304', senderAddress: 'tel:+2250000', senderName: 'iGaz CI',
        outboundSMSTextMessage: { message: 'Votre code est 123456' },
      },
    });
  });

  it('réutilise le jeton ; le renouvelle et renvoie une fois si Orange répond 401', async () => {
    const { http, calls } = fakeOrange([{ status: 201 }, { status: 401 }, { status: 201 }]);
    const sms = new OrangeSmsProvider(config, http);
    await sms.send('+2250701020304', 'a');
    await sms.send('+2250701020304', 'b');
    expect(calls.map((c) => c.url.endsWith('/token'))).toEqual([true, false, false, true, false]);
    expect((calls[4].init.headers as Record<string, string>).Authorization).toBe('Bearer tok2');
  });

  it('un seul jeton demandé pour des envois simultanés', async () => {
    const { http, calls } = fakeOrange([{ status: 201 }, { status: 201 }, { status: 201 }]);
    const sms = new OrangeSmsProvider(config, http);
    await Promise.all(['a', 'b', 'c'].map((m) => sms.send('+2250701020304', m)));
    expect(calls.filter((c) => c.url.endsWith('/token'))).toHaveLength(1);
  });

  it('refus d’Orange (forfait épuisé, expéditeur non approuvé…) : erreur claire, sans le texte du message', async () => {
    const { http } = fakeOrange([{ status: 403, body: { requestError: { policyException: { messageId: 'POL3006' } } } }]);
    const error = jest.spyOn(Logger.prototype, 'error');
    const p = new OrangeSmsProvider(config, http).send('+2250701020304', 'Votre code est 654321');
    await expect(p).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(error.mock.calls.flat().join(' ')).not.toContain('654321');
  });

  it('configuration : identifiants requis, expéditeur par défaut, nom d’expéditeur contrôlé', () => {
    expect(() => orangeConfigFromEnv({})).toThrow(/ORANGE_SMS_CLIENT_ID/);
    expect(orangeConfigFromEnv({ ORANGE_SMS_CLIENT_ID: 'a', ORANGE_SMS_CLIENT_SECRET: 'b' }))
      .toEqual({ clientId: 'a', clientSecret: 'b', senderAddress: 'tel:+2250000', senderName: undefined });
    expect(() => orangeConfigFromEnv({ ORANGE_SMS_CLIENT_ID: 'a', ORANGE_SMS_CLIENT_SECRET: 'b', ORANGE_SMS_SENDER_NAME: 'iGaz-CI!' })).toThrow(/11/);
  });
});
