import { bootTestApp, type TestApp } from './support/app';

// Throwaway test for the red-main check; reverted right after.
describe('demo: the mug is on sale', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  it('lists MUG-01', async () => {
    const res = await t.http().get('/catalog/products').expect(200);
    expect(res.body.map((p: { sku: string }) => p.sku)).toContain('MUG-01');
  });
});
