/**
 * Read Vite env without a top-level `import.meta` token (Jest/CJS cannot parse it).
 * Browser: resolved via dynamic access to `import.meta.env` at runtime.
 * Jest/Node: use `process.env.*` (set in client/src/test/setup.ts when needed).
 */
function readViteEnv(): Record<string, unknown> | undefined {
  try {
    return new Function(
      'return typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : undefined',
    )() as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

export function getViteEnvString(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env[name] != null) {
    return process.env[name];
  }
  const value = readViteEnv()?.[name];
  if (value == null) return undefined;
  return String(value);
}

export function isViteProd(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    return true;
  }
  const env = readViteEnv();
  return env?.PROD === true || env?.MODE === 'production';
}

export function isViteFlagTrue(name: string): boolean {
  if (typeof process !== 'undefined' && process.env[name] === 'true') {
    return true;
  }
  return readViteEnv()?.[name] === 'true';
}
