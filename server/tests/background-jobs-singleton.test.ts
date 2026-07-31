/**
 * @jest-environment node
 */

describe('background-jobs-singleton', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  async function load() {
    return import('../lib/background-jobs-singleton');
  }

  it('allows payment-flow monitor in development without worker flags', async () => {
    delete process.env.ENABLE_BACKGROUND_JOBS;
    delete process.env.AUTO_PAY_SINGLE_INSTANCE;
    delete process.env.PLAYWRIGHT_WEB_SERVER;
    const { canStartPaymentFlowMonitor, isBackgroundJobsSingleton } = await load();
    expect(isBackgroundJobsSingleton('development')).toBe(true);
    expect(canStartPaymentFlowMonitor('development')).toBe(true);
  });

  it('blocks monitor in production when neither singleton flag is set', async () => {
    delete process.env.ENABLE_BACKGROUND_JOBS;
    delete process.env.AUTO_PAY_SINGLE_INSTANCE;
    delete process.env.PLAYWRIGHT_WEB_SERVER;
    const { canStartPaymentFlowMonitor, isBackgroundJobsSingleton } = await load();
    expect(isBackgroundJobsSingleton('production')).toBe(false);
    expect(canStartPaymentFlowMonitor('production')).toBe(false);
  });

  it('allows monitor in production when ENABLE_BACKGROUND_JOBS is true', async () => {
    process.env.ENABLE_BACKGROUND_JOBS = 'true';
    delete process.env.AUTO_PAY_SINGLE_INSTANCE;
    const { canStartPaymentFlowMonitor, isBackgroundJobsSingleton } = await load();
    expect(isBackgroundJobsSingleton('production')).toBe(true);
    expect(canStartPaymentFlowMonitor('production')).toBe(true);
  });

  it('allows monitor in production when only AUTO_PAY_SINGLE_INSTANCE is true', async () => {
    delete process.env.ENABLE_BACKGROUND_JOBS;
    process.env.AUTO_PAY_SINGLE_INSTANCE = 'true';
    const { canStartPaymentFlowMonitor, isBackgroundJobsSingleton } = await load();
    expect(isBackgroundJobsSingleton('production')).toBe(false);
    expect(canStartPaymentFlowMonitor('production')).toBe(true);
  });

  it('blocks monitor under Playwright web server', async () => {
    process.env.PLAYWRIGHT_WEB_SERVER = 'true';
    process.env.ENABLE_BACKGROUND_JOBS = 'true';
    const { canStartPaymentFlowMonitor, isBackgroundJobsSingleton } = await load();
    expect(isBackgroundJobsSingleton('development')).toBe(false);
    expect(canStartPaymentFlowMonitor('development')).toBe(false);
  });
});
