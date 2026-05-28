import {
  expireCollectionsPastDeadline,
  processNoticePeriodLocations,
  recheckLocationThreshold,
} from './location-activation-service';
import { getDb } from '../db';
import { locations } from '@shared/schema';
import { eq } from 'drizzle-orm';

const TICK_MS = 15 * 60 * 1000; // 15 minutes
let intervalId: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    await expireCollectionsPastDeadline();
    await processNoticePeriodLocations();

    const db = await getDb();
    const collecting = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.activationStatus, 'collecting'));

    for (const row of collecting) {
      await recheckLocationThreshold(row.id);
    }
  } catch (err) {
    console.error('[LocationActivationScheduler] tick error:', err);
  }
}

export function startLocationActivationScheduler(): void {
  if (intervalId != null) return;
  console.log('[LocationActivationScheduler] Starting (interval 15m)');
  void tick();
  intervalId = setInterval(() => void tick(), TICK_MS);
}

export function stopLocationActivationScheduler(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
