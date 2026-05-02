import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../server/auth/google', () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../server/utils', () => ({
  requireWriteAccess: (_req: any, _res: any, next: any) => next(),
  anonymizeWithOpenMed: async (s: string) => s,
  logAiOutbound: async () => {},
}));

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockCreate } };
    constructor(_: any) {}
  },
}));

let aiRouter: any;
beforeEach(async () => {
  vi.resetModules();
  process.env.MISTRAL_API_KEY = 'test';
  mockCreate.mockReset();
  aiRouter = (await import('../server/routes/ai')).default;
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(aiRouter);
  return app;
};

describe('POST /api/translate (multi-language)', () => {
  it('returns translations keyed by id:field × lang', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        'a:label': { en: 'Hypertension', it: 'Ipertensione' },
        'b:label': { en: 'Diabetes', it: 'Diabete' },
      }) } }],
    });

    const res = await request(buildApp()).post('/api/translate').send({
      items: [
        { id: 'a', field: 'label', text: 'Bluthochdruck' },
        { id: 'b', field: 'label', text: 'Zuckerkrankheit' },
      ],
      sourceLang: 'de',
      targetLangs: ['en', 'it'],
    });

    expect(res.status).toBe(200);
    expect(res.body.translations).toEqual({
      'a:label': { en: 'Hypertension', it: 'Ipertensione' },
      'b:label': { en: 'Diabetes', it: 'Diabete' },
    });
  });

  it('rejects requests where targetLangs includes sourceLang', async () => {
    const res = await request(buildApp()).post('/api/translate').send({
      items: [{ id: 'a', field: 'label', text: 'x' }],
      sourceLang: 'de',
      targetLangs: ['de', 'en'],
    });
    expect(res.status).toBe(400);
  });

  it('chunks requests larger than 50 items into multiple Mistral calls and merges', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(
        Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`i${i}:label`, { en: `t${i}` }]))
      ) } }],
    });
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(
        Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`i${i + 50}:label`, { en: `t${i + 50}` }]))
      ) } }],
    });

    const items = Array.from({ length: 60 }, (_, i) => ({
      id: `i${i}`, field: 'label' as const, text: `term ${i}`,
    }));
    const res = await request(buildApp()).post('/api/translate').send({
      items, sourceLang: 'de', targetLangs: ['en'],
    });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(Object.keys(res.body.translations)).toHaveLength(60);
  });

  it('tolerates missing keys in Mistral response (warns, returns what it got)', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        'a:label': { en: 'Hypertension' },
        // 'b:label' missing
      }) } }],
    });

    const res = await request(buildApp()).post('/api/translate').send({
      items: [
        { id: 'a', field: 'label', text: 'Bluthochdruck' },
        { id: 'b', field: 'label', text: 'Zuckerkrankheit' },
      ],
      sourceLang: 'de',
      targetLangs: ['en'],
    });

    expect(res.status).toBe(200);
    expect(res.body.translations['a:label'].en).toBe('Hypertension');
    expect(res.body.translations['b:label']).toBeUndefined();
  });
});
