/** Minimal timestamped logger. Kept tiny on purpose (KISS). */
type Level = 'info' | 'warn' | 'error';

function log(level: Level, msg: string, scope?: string, err?: unknown): void {
  const ts = new Date().toISOString();
  const tag = scope ? `[${scope}]` : '';
  const line = `${ts} ${level.toUpperCase()} ${tag} ${msg}`.trim();
  if (level === 'error') {
    console.error(line, err ?? '');
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (msg: string, scope?: string) => log('info', msg, scope),
  warn: (msg: string, scope?: string) => log('warn', msg, scope),
  error: (msg: string, scope?: string, err?: unknown) => log('error', msg, scope, err),
};
