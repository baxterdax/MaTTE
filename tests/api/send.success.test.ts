import request from 'supertest';

jest.mock('../../src/db/pool', () => {
  const queries: any[] = [];
  return {
    query: jest.fn(),
    pool: {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn((sql: string, params: any[]) => {
          queries.push({ sql, params });
          if (/INSERT INTO email_logs/.test(sql)) {
            return Promise.resolve({ rows: [{ id: 123 }] });
          }
          if (/UPDATE email_logs/.test(sql)) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        }),
        release: jest.fn(),
      })
    },
  };
});

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'abc123' }),
  }),
}));

describe('POST /send success', () => {
  let encrypt: (s: string) => string;
  let app: any;
  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
    jest.resetModules();
    encrypt = (await import('../../src/utils/encryption')).encrypt;
    app = (await import('../../src/index')).default;
  });

  it('sends and logs email with variables and attachments', async () => {
    const { query } = require('../../src/db/pool');
    (query as jest.Mock).mockResolvedValueOnce({ rows: [
      { id: 1, name: 't', smtp_host: encrypt('smtp.example.com'), smtp_port: encrypt('587'), smtp_user: encrypt('user'), smtp_pass: encrypt('pass'), smtp_secure: 'false', from_email: 'noreply@example.com' }
    ]});

    const res = await request(app)
      .post('/send')
      .set('X-API-Key', 'test')
      .send({
        to: 'user@example.com',
        subject: 'Hi {{name}}',
        htmlBody: '<b>{{name}}</b>',
        variables: { name: 'Ada' },
        attachments: [{ filename: 'hi.txt', content: 'SGVsbG8=', encoding: 'base64' }]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('messageId');
  });
});
