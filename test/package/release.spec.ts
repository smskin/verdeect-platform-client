// Выпуск версии (prd.md AC-16, NFR-6, D1, D10): сухой прогон scripts/publish.mjs против локального реестра
// на node:http — без сети и без публикации; структура ci.yml, Makefile и скрипта pack:check.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { REPO_ROOT, runCommand, type CommandResult } from './support/pack.js';

type RegistryMode = 'missing' | 'published';

interface WorkflowStep {
    readonly uses?: string;
    readonly run?: string;
    readonly with?: Record<string, unknown>;
    readonly env?: Record<string, string>;
    readonly 'continue-on-error'?: unknown;
}

interface WorkflowJob {
    readonly needs?: string | readonly string[];
    readonly if?: string;
    readonly environment?: string;
    readonly permissions?: Record<string, string>;
    readonly 'runs-on'?: string;
    readonly strategy?: { readonly matrix?: { readonly node?: readonly number[] } };
    readonly steps: readonly WorkflowStep[];
    readonly 'continue-on-error'?: unknown;
}

interface Workflow {
    readonly on: {
        readonly push?: {
            readonly branches?: readonly string[];
            readonly tags?: readonly string[];
        };
        readonly pull_request?: unknown;
    };
    readonly permissions?: Record<string, string>;
    readonly jobs: Record<string, WorkflowJob>;
}

const PUBLISH_LINE = '[publish] npm publish';

function needsOf(job: WorkflowJob | undefined): string[] {
    const needs = job?.needs ?? [];

    return typeof needs === 'string' ? [needs] : [...needs];
}

function describeResult(result: CommandResult): string {
    return `code ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
}

describe('AC-16: выпуск версии', () => {
    let workflow: Workflow;
    let makefile: string;
    let scripts: Record<string, string>;
    let version: string;
    let packageName: string;
    let registry: Server;
    let registryUrl: string;
    let mode: RegistryMode = 'missing';
    let configDir: string;

    beforeAll(async () => {
        workflow = parse(
            await readFile(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8'),
        ) as Workflow;
        makefile = await readFile(join(REPO_ROOT, 'Makefile'), 'utf8');
        const manifest = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as {
            name: string;
            version: string;
            scripts: Record<string, string>;
        };
        version = manifest.version;
        packageName = manifest.name;
        scripts = manifest.scripts;

        registry = createServer((request, response) => {
            console.info(`[package-check] registry ${mode} ${request.method} ${request.url}`);
            response.setHeader('content-type', 'application/json');
            if (mode === 'missing') {
                response.statusCode = 404;
                response.end(JSON.stringify({ error: 'Not found' }));

                return;
            }
            response.end(
                JSON.stringify({
                    name: packageName,
                    'dist-tags': { latest: version },
                    versions: { [version]: { name: packageName, version } },
                }),
            );
        });
        await new Promise<void>((resolve) => registry.listen(0, '127.0.0.1', resolve));
        registryUrl = `http://127.0.0.1:${(registry.address() as AddressInfo).port}/`;

        // Пустой пользовательский конфиг npm: реестр и токены из ~/.npmrc не перебьют локальный реестр.
        configDir = await mkdtemp(join(tmpdir(), 'verdeect-platform-client-npmrc-'));
        await writeFile(join(configDir, '.npmrc'), '');
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => registry.close(() => resolve()));
        await rm(configDir, { recursive: true, force: true });
    });

    async function dryRun(tag: string, registryMode: RegistryMode): Promise<CommandResult> {
        mode = registryMode;

        return runCommand('node', ['scripts/publish.mjs', '--dry-run'], REPO_ROOT, {
            GITHUB_REF_NAME: tag,
            npm_config_registry: registryUrl,
            npm_config_userconfig: join(configDir, '.npmrc'),
            // Как в CI: токенов нет, только OIDC (D1).
            NODE_AUTH_TOKEN: '',
        });
    }

    it('AC-16: тег v<version> при совпадающей version и отсутствии в npm — сухой прогон доходит до npm publish --dry-run, код 0, авторизация только OIDC', async () => {
        const result = await dryRun(`v${version}`, 'missing');

        expect(result.code, describeResult(result)).toBe(0);
        expect(result.stdout).toContain('авторизация: OIDC (Trusted Publishing)');
        expect(result.stdout).toContain(`${PUBLISH_LINE} --access public --dry-run`);
    });

    it('AC-16: тег ≠ version — код 1 до npm publish, «не совпадает»', async () => {
        const [major, minor, patch] = version.split('.').map(Number);
        const result = await dryRun(`v${major}.${minor}.${(patch ?? 0) + 1}`, 'missing');

        expect(result.code, describeResult(result)).toBe(1);
        expect(result.stderr).toContain('не совпадает');
        expect(result.stdout).not.toContain(PUBLISH_LINE);
    });

    it('AC-16: версия уже опубликована — код 1 до npm publish, «уже опубликована»', async () => {
        const result = await dryRun(`v${version}`, 'published');

        expect(result.code, describeResult(result)).toBe(1);
        expect(result.stderr).toContain('уже опубликована');
        expect(result.stdout).not.toContain(PUBLISH_LINE);
    });

    it('AC-16: тег не по шаблону v<major>.<minor>.<patch> — код 1 до npm publish', async () => {
        for (const tag of ['v1.0', '1.0.0', `v${version}-rc.1`]) {
            const result = await dryRun(tag, 'missing');

            expect(result.code, `${tag}\n${describeResult(result)}`).toBe(1);
            expect(result.stderr).toContain('не соответствует шаблону');
            expect(result.stdout).not.toContain(PUBLISH_LINE);
        }
    });

    it('NFR-6: jobs lint → test → build → publish; test — матрица Node 22 и 24; триггеры push (ветки и теги v[0-9]+.[0-9]+.[0-9]+) и pull_request; runs — make install/lint/analyse, make test, make build pack-check', () => {
        expect(Object.keys(workflow.jobs)).toEqual(['lint', 'test', 'build', 'publish']);
        expect(workflow.on.push?.branches).toEqual(['**']);
        expect(workflow.on.push?.tags).toEqual(['v[0-9]+.[0-9]+.[0-9]+']);
        expect(workflow.on).toHaveProperty('pull_request');

        expect(workflow.jobs['test']?.strategy?.matrix?.node).toEqual([22, 24]);
        const runs = (name: string): string[] =>
            (workflow.jobs[name]?.steps ?? []).flatMap((step) => (step.run ? [step.run] : []));
        expect(runs('lint')).toEqual(['make install', 'make lint', 'make analyse']);
        expect(runs('test')).toEqual(['make install', 'make test']);
        expect(runs('build')).toEqual(['make install', 'make build pack-check']);
    });

    it('NFR-6 / D1: publish — needs lint, test, build; if только refs/tags/v; environment npm; GitHub-hosted runner; Node 24 и npm >= 11.15 до публикации; без registry-url; permissions id-token: write только у publish; без secrets, NODE_AUTH_TOKEN, NPM_TOKEN и continue-on-error', () => {
        expect(needsOf(workflow.jobs['publish']).sort()).toEqual(['build', 'lint', 'test']);
        expect(needsOf(workflow.jobs['build'])).toEqual(['test']);
        expect(needsOf(workflow.jobs['test'])).toEqual(['lint']);

        const publish = workflow.jobs['publish'];
        expect(publish?.if).toBe("startsWith(github.ref, 'refs/tags/v')");
        for (const [name, job] of Object.entries(workflow.jobs)) {
            if (name !== 'publish') {
                expect(job.if, name).toBeUndefined();
            }
        }
        expect(publish?.environment).toBe('npm');
        // Trusted Publishing работает только на GitHub-hosted runner.
        expect(publish?.['runs-on']).toMatch(/^(ubuntu|windows|macos)-/);

        const steps = publish?.steps ?? [];
        const upgrade = steps.findIndex((step) => step.run === 'npm install -g npm@^11.15.0');
        const publishIndex = steps.findIndex((step) => step.run === 'node scripts/publish.mjs');
        expect(upgrade, 'npm upgrade step').toBeGreaterThanOrEqual(0);
        expect(upgrade).toBeLessThan(publishIndex);
        const setupNode = steps.find((step) => step.uses?.startsWith('actions/setup-node@'));
        expect(setupNode?.with?.['node-version']).toBe(24);
        // registry-url пишет .npmrc с _authToken=${NODE_AUTH_TOKEN} — при OIDC он не нужен.
        expect(setupNode?.with).not.toHaveProperty('registry-url');

        expect(workflow.permissions).toEqual({ contents: 'read' });
        expect(publish?.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
        const withPermissions = Object.entries(workflow.jobs)
            .filter(([, job]) => job.permissions !== undefined)
            .map(([name]) => name);
        expect(withPermissions).toEqual(['publish']);

        // Комментарии ci.yml не в счёт: проверяется разобранный YAML.
        const parsed = JSON.stringify(workflow.jobs);
        for (const forbidden of ['secrets.', 'NODE_AUTH_TOKEN', 'NPM_TOKEN']) {
            expect(parsed, forbidden).not.toContain(forbidden);
        }
        const loose = Object.entries(workflow.jobs).flatMap(([name, job]) => [
            ...(job['continue-on-error'] === undefined ? [] : [name]),
            ...job.steps
                .filter((step) => step['continue-on-error'] !== undefined)
                .map(() => `${name} step`),
        ]);
        expect(loose).toEqual([]);
    });

    it('D10: ни один jobs.*.steps[].run в ci.yml не содержит test-contract; среди пререквизитов ci: Makefile нет test-contract; цель test-contract есть и запускает vitest.contract.config.ts через test:contract', () => {
        const runs = Object.values(workflow.jobs).flatMap((job) =>
            job.steps.flatMap((step) => (step.run ? [step.run] : [])),
        );
        expect(runs.filter((run) => run.includes('test-contract'))).toEqual([]);
        expect(runs.filter((run) => run.includes('test:contract'))).toEqual([]);

        const ci = makefile.match(/^ci:([^#\n]*)/m)?.[1] ?? '';
        expect(ci.trim()).toBe('lint analyse test build pack-check');

        const recipe = makefile.match(/^test-contract:.*\n((?:\t.*\n?)+)/m)?.[1] ?? '';
        expect(recipe).toContain('test:contract');
        expect(scripts['test:contract']).toBe('vitest run -c vitest.contract.config.ts');
    });

    it('AC-16: package.json — скрипт pack:check запускает publint --strict, attw --pack . --profile esm-only и test:package; Makefile pack-check вызывает pack:check', () => {
        const packCheck = scripts['pack:check'] ?? '';
        for (const fragment of [
            'publint --strict',
            'attw --pack . --profile esm-only',
            'test:package',
        ]) {
            expect(packCheck, fragment).toContain(fragment);
        }

        const recipe = makefile.match(/^pack-check:.*\n((?:\t.*\n?)+)/m)?.[1] ?? '';
        expect(recipe).toContain('pack:check');
    });
});
