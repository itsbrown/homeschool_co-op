/**
 * Read Vite `VITE_*` flags without a top-level `import.meta` token (Jest/CJS cannot parse it).
 * Browser: resolved via dynamic access to `import.meta.env` at runtime.
 * Jest/Node: use `process.env.VITE_*` (set in client/src/test/setup.ts when needed).
 */
export function isViteFlagTrue(name: string): boolean {
  if (typeof process !== 'undefined' && process.env[name] === 'true') {
    return true;
  }
  try {
    const env = new Function(
      'return typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : undefined',
    )() as Record<string, string | undefined> | undefined;
    return env?.[name] === 'true';
  } catch {
    return false;
  }
}
