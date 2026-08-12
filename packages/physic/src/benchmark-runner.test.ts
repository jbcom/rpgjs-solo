import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

describe('physics benchmark package runner', () => {
  it('executes the real benchmark graph through the package-local tsx script', () => {
    const output = execFileSync('pnpm', ['run', 'benchmark:smoke'], {
      cwd: packageDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    });

    expect(output).toContain('Physics benchmark runner smoke: PASS');
  });
});
