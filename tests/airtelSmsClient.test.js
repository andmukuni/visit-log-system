import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildAirtelSmsRequest, resolveAirtelEndpoint, sendAirtelSms } from '../server/adapters/airtelSmsClient.js';

const config = {
  airtel_base_url: 'https://www.airtel.co.zm/gateway/v1',
  airtel_customer_id: 'cust-1',
  airtel_username: 'api-user',
  airtel_password: 'api-pass',
  sender_id: 'WGVL',
  airtel_sub_account_id: 'sub-1',
  airtel_message_type: 'default',
};

describe('airtelSmsClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('builds the default and flash endpoints', () => {
    assert.equal(
      resolveAirtelEndpoint('https://www.airtel.co.zm/gateway/v1/', 'default'),
      'https://www.airtel.co.zm/gateway/v1/sendDefaultSms',
    );
    assert.equal(
      resolveAirtelEndpoint('https://www.airtel.co.zm/gateway/v1/sendDefaultSms', 'flash'),
      'https://www.airtel.co.zm/gateway/v1/sendFlashSms',
    );
  });

  it('posts Basic auth JSON with a normalized Zambian number', async () => {
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ messageId: 'msg-1' }) };
    };

    const result = await sendAirtelSms(config, { phone: '0971234567', message: 'Hello' });
    assert.equal(result.provider, 'airtel');
    assert.equal(result.messageId, 'msg-1');
    assert.equal(result.destination, '260971234567');
    assert.equal(calls[0].url, 'https://www.airtel.co.zm/gateway/v1/sendDefaultSms');
    assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from('api-user:api-pass').toString('base64')}`);
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      customerId: 'cust-1',
      senderId: 'WGVL',
      destinationAddress: ['260971234567'],
      message: 'Hello',
      metaData: { subAccountId: 'sub-1' },
    });
  });

  it('uses the username with hyphens when sub-account ID is blank', () => {
    const request = buildAirtelSmsRequest(
      { ...config, airtel_username: 'aaaaaaaa_bbbb_4ccc_8ddd_eeeeeeeeeeee', airtel_sub_account_id: '' },
      { phone: '0971234567', message: 'Hello' },
    );
    assert.equal(
      JSON.parse(request.init.body).metaData.subAccountId,
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    );
  });

  it('uses the flash endpoint when message type is flash', () => {
    const request = buildAirtelSmsRequest(
      { ...config, airtel_message_type: 'flash' },
      { phone: '+260971234567', message: 'Flash' },
    );
    assert.equal(request.url, 'https://www.airtel.co.zm/gateway/v1/sendFlashSms');
    assert.equal(request.destination, '260971234567');
  });
});
