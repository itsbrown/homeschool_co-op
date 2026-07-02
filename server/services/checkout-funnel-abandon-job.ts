import { emitStaleCheckoutAbandonEvents } from '../lib/school-analytics';

let abandonInterval: ReturnType<typeof setInterval> | null = null;

export async function processCheckoutFunnelAbandons(): Promise<{ emitted: number }> {
  console.log('🛒 Checking stale checkout funnel attempts for abandon events...');
  try {
    const result = await emitStaleCheckoutAbandonEvents();
    console.log(`🛒 Checkout abandon job complete: ${result.emitted} emitted`);
    return result;
  } catch (error) {
    console.error('❌ Checkout abandon job failed:', error);
    throw error;
  }
}

export function startCheckoutFunnelAbandonJob(): void {
  if (abandonInterval) {
    console.log('ℹ️ Checkout abandon scheduler already running; skipping duplicate start');
    return;
  }

  const startupTimeout = setTimeout(() => {
    processCheckoutFunnelAbandons().catch((err) => {
      console.error('Error in initial checkout abandon check:', err);
    });
  }, 45_000);
  startupTimeout.unref?.();

  const intervalHours = 6;
  abandonInterval = setInterval(() => {
    processCheckoutFunnelAbandons().catch((err) => {
      console.error('Error in scheduled checkout abandon check:', err);
    });
  }, intervalHours * 60 * 60 * 1000);
  abandonInterval.unref?.();

  console.log(`✅ Checkout abandon scheduler started (runs every ${intervalHours} hours)`);
}

export function stopCheckoutFunnelAbandonJob(): void {
  if (abandonInterval) {
    clearInterval(abandonInterval);
    abandonInterval = null;
    console.log('🛑 Checkout abandon scheduler stopped');
  }
}
