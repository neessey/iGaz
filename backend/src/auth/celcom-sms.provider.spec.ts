import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { CelcomSmsProvider, celcomConfigFromEnv } from './celcom-sms.provider';
import { OrangeSmsProvider } from './orange-sms.provider';
import { smsProviderFromEnv } from './sms.module';
import { ConsoleSmsProvider } from './sms.provider';

function fakeCelcom(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { http, calls };
}

const config = { apiKey: 'cle', partnerId: '1234', sender: 'iGaz CI' };
const ok = { responses: [{ 'respose-code': 200, 'response-description': 'Success', mobile: 2250701020304, messageid: 1, networkid: '1' }] };

describe('SMS Celcom Africa', () => {
  let error: jest.SpyInstance;
  beforeEach(() => { error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined); });
  afterEach(() => error.mockRestore());

  it('envoie au format Celcom : numéro sans « + », nom d’expéditeur, identifiants', async () => {
    const { http, calls } = fakeCelcom(200, ok);
    await new CelcomSmsProvider(config, http).send('+2250701020304', 'Votre code est 123456');
    expect(calls[0].url).toBe('https://isms.celcomafrica.com/api/services/sendsms/');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      apikey: 'cle', partnerID: '1234', shortcode: 'iGaz CI', mobile: '2250701020304', message: 'Votre code est 123456',
    });
  });

  it('refus (crédit épuisé, expéditeur non approuvé…) : erreur claire, cause dans les journaux, jamais le message', async () => {
    for (const [code, reason] of [[1004, 'crédit'], [1001, 'expéditeur']] as const) {
      const { http } = fakeCelcom(200, { responses: [{ 'respose-code': code, 'response-description': 'x' }] });
      await expect(new CelcomSmsProvider(config, http).send('+2250701020304', 'Votre code est 654321'))
        .rejects.toBeInstanceOf(ServiceUnavailableException);
      const logged = error.mock.calls.flat().join(' ');
      expect(logged).toContain(reason);
      expect(logged).not.toContain('654321');
    }
  });

  it('erreur globale (identifiants) ou Celcom injoignable : erreur claire', async () => {
    const { http } = fakeCelcom(200, { 'response-code': 1006, 'response-description': 'Invalid credentials' });
    await expect(new CelcomSmsProvider(config, http).send('+2250701020304', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(new CelcomSmsProvider(config, down).send('+2250701020304', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('configuration : identifiants et nom d’expéditeur requis ; choix du prestataire par SMS_PROVIDER', () => {
    expect(() => celcomConfigFromEnv({ CELCOM_API_KEY: 'a', CELCOM_PARTNER_ID: 'b' })).toThrow(/CELCOM_SENDER/);
    const celcom = { SMS_PROVIDER: 'celcom', CELCOM_API_KEY: 'a', CELCOM_PARTNER_ID: 'b', CELCOM_SENDER: 'iGaz CI' };
    expect(smsProviderFromEnv(celcom)).toBeInstanceOf(CelcomSmsProvider);
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'orange', ORANGE_SMS_CLIENT_ID: 'a', ORANGE_SMS_CLIENT_SECRET: 'b' })).toBeInstanceOf(OrangeSmsProvider);
    expect(smsProviderFromEnv({})).toBeInstanceOf(ConsoleSmsProvider);
    expect(() => smsProviderFromEnv({ SMS_PROVIDER: 'celcom' })).toThrow(/CELCOM_API_KEY/);
  });
});
