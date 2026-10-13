import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '..');

function analyze(files: Record<string, string>) {
  const fixture = mkdtempSync(join(tmpdir(), 'vibe-architecture-'));
  try {
    const allFiles = {
      'tsconfig.json': '{"compilerOptions":{"moduleResolution":"Bundler","module":"ESNext"}}',
      ...files,
    };
    for (const [name, content] of Object.entries(allFiles)) {
      const path = join(fixture, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    const result = spawnSync(
      process.execPath,
      [
        join(projectRoot, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs'),
        '--config',
        join(projectRoot, '.dependency-cruiser.cjs'),
        '--output-type',
        'json',
        'src',
      ],
      { cwd: fixture, encoding: 'utf8' },
    );
    if (!result.stdout)
      throw new Error(
        result.error?.message ??
          `No dependency report: status=${result.status}, signal=${result.signal}, stderr=${result.stderr}`,
      );
    const report = JSON.parse(result.stdout) as {
      summary: { violations: { rule: { name: string } }[] };
    };
    return report.summary.violations.map((violation) => violation.rule.name);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe('Architecture boundary enforcement', () => {
  it('accepts ports, pure domain and the composition root', () => {
    expect(
      analyze({
        'src/domain/model.ts': 'export interface Model { model: string }',
        'src/application/port.ts':
          'import type { Model } from "../domain/model"; export type Port = Model;',
        'src/infrastructure/storage.ts':
          'import type { Port } from "../application/port"; export type Storage = Port;',
        'src/features/settings/page.ts':
          'import type { Port } from "../../application/port"; export type Props = Port;',
        'src/app/create-services.ts':
          'import type { Storage } from "../infrastructure/storage"; export type Services = Storage;',
      }),
    ).toEqual([]);
  });

  it.each(['react', 'openai'])('rejects a domain type dependency on %s', (dependency) => {
    expect(
      analyze({
        'src/domain/model.ts': `import type X from "${dependency}"; export type Model = X;`,
      }),
    ).toContain('domain-only-domain');
  });

  it('rejects a presentation dependency on a storage adapter', () => {
    expect(
      analyze({
        'src/infrastructure/storage.ts': 'export const storage = {};',
        'src/features/settings/page.ts':
          'import { storage } from "../../infrastructure/storage"; export { storage };',
      }),
    ).toContain('presentation-no-infrastructure');
  });

  it('rejects infrastructure imports outside the composition root', () => {
    expect(
      analyze({
        'src/infrastructure/storage.ts': 'export const storage = {};',
        'src/app/App.ts':
          'import { storage } from "../infrastructure/storage"; export { storage };',
      }),
    ).toContain('composition-root-only');
  });

  it('rejects cycles even when imports are type-only', () => {
    expect(
      analyze({
        'src/domain/one.ts': 'import type { Two } from "./two"; export interface One { two: Two }',
        'src/domain/two.ts': 'import type { One } from "./one"; export interface Two { one: One }',
      }),
    ).toContain('no-cycles');
  });

  it('rejects direct IO in presentation and application, including globalThis', async () => {
    const eslint = new ESLint({ cwd: projectRoot });
    for (const filePath of ['src/features/settings/Bad.ts', 'src/application/Bad.ts']) {
      const [result] = await eslint.lintText(
        'export const bad = () => { fetch("/"); globalThis.indexedDB.open("db"); };',
        { filePath },
      );
      expect(result!.messages.map((message) => message.ruleId)).toEqual(
        expect.arrayContaining(['no-restricted-globals', 'no-restricted-properties']),
      );
    }
  });
});
