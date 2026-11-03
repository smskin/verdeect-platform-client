// Test Images Pinned and Identical Everywhere (skill-context aif-build-automation, r2): теги образов слоя C.
// platform-stand.ts читается как текст — импорт затянул бы Testcontainers в слой U.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STAND = 'test/contract/support/platform-stand.ts';
const PRD = 'requirements/0000-platform-client/prd.md';
const PLATFORM_DIR = new URL('../../../verdeect-platform/', import.meta.url);
const HAS_PLATFORM = existsSync(new URL('.gitlab-ci.yml', PLATFORM_DIR));
const IMAGES = { POSTGRES_IMAGE: 'postgres', RABBITMQ_IMAGE: 'rabbitmq' } as const;
// Версия и вариант образа: postgres:17.11-alpine3.24, rabbitmq:4.3.6-management-alpine.
const PINNED = /^[a-z]+:\d+\.\d+(\.\d+)?-[a-z0-9.-]+$/;

const read = (url: URL): string => readFileSync(url, 'utf8');
const own = (file: string): string => read(new URL(`../../${file}`, import.meta.url));

function standTag(name: keyof typeof IMAGES): string {
    const tag = new RegExp(`^const ${name} = '([^']+)';$`, 'm').exec(own(STAND))?.[1];
    expect(tag, `${STAND}: константа ${name} не найдена`).toBeDefined();
    return String(tag);
}

/** Образы из `services:` GitLab CI с подстановкой `${VAR}` из `variables:`. */
function ciServiceImages(ci: string): string[] {
    const vars = new Map([...ci.matchAll(/^\s+(\w+): (\S+)$/gm)].map((m) => [m[1], m[2]]));
    return [...ci.matchAll(/^\s+- name: (\S+)$/gm)].map((m) =>
        String(m[1]).replace(/\$\{(\w+)\}/g, (_, v: string) => vars.get(v) ?? `\${${v}}`),
    );
}

function imagesOf(images: string[], repo: string): string[] {
    return [...new Set(images.filter((image) => image.startsWith(`${repo}:`)))];
}

describe('Test Images: теги образов слоя C', () => {
    it.each(Object.keys(IMAGES) as (keyof typeof IMAGES)[])(
        'Test Images: %s в platform-stand.ts закреплён версией и вариантом',
        (name) => {
            const tag = standTag(name);
            expect(tag.startsWith(`${IMAGES[name]}:`), `${STAND}: ${name}=${tag}`).toBe(true);
            expect(tag, `${STAND}: ${name}=${tag} — плавающий тег`).toMatch(PINNED);
        },
    );

    it.each(Object.keys(IMAGES) as (keyof typeof IMAGES)[])(
        'Test Images: %s совпадает с prd.md §7 (стенд слоя C)',
        (name) => {
            const line = own(PRD)
                .split('\n')
                .find((l) => l.includes('те же образы, что в CI Platform'));
            expect(line, `${PRD}: строка с образами слоя C не найдена`).toBeDefined();
            const tags = [...String(line).matchAll(/`([a-z]+:[^`]+)`/g)].map((m) => String(m[1]));
            expect(imagesOf(tags, IMAGES[name]), `${PRD} против ${STAND}`).toStrictEqual([
                standTag(name),
            ]);
        },
    );

    it.skipIf(!HAS_PLATFORM).each(Object.keys(IMAGES) as (keyof typeof IMAGES)[])(
        `Test Images: %s совпадает с services .gitlab-ci.yml и compose.override.yml Platform${
            HAS_PLATFORM ? '' : ' — пропуск: нет ../verdeect-platform'
        }`,
        (name) => {
            const tag = standTag(name);
            const ci = ciServiceImages(read(new URL('.gitlab-ci.yml', PLATFORM_DIR)));
            const compose = [
                ...read(new URL('compose.override.yml', PLATFORM_DIR)).matchAll(
                    /^\s+image: (\S+)$/gm,
                ),
            ].map((m) => String(m[1]));
            expect(
                imagesOf(ci, IMAGES[name]),
                `verdeect-platform/.gitlab-ci.yml services против ${STAND}`,
            ).toStrictEqual([tag]);
            expect(
                imagesOf(compose, IMAGES[name]),
                `verdeect-platform/compose.override.yml против ${STAND}`,
            ).toStrictEqual([tag]);
        },
    );
});
