// Публикация @verdeect/platform-client из CI по тегу v<semver> (prd.md D1, NFR-6, AC-16; docs/releasing.md).
// generic: скрипт выпуска, только stdlib. До npm publish сверяет тег с version и проверяет, что версии нет в npm;
// при любой неопределённости падает и ничего не публикует. Флаг --dry-run передаётся в npm publish.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TAG_PATTERN = /^v\d+\.\d+\.\d+$/;
const ROOT = join(import.meta.dirname, '..');

function log(message) {
    console.log(`[publish] ${message}`);
}

function fail(message) {
    console.error(`[publish] ${message}`);
    process.exit(1);
}

function readManifest() {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
}

function npm(args) {
    log(`npm ${args.join(' ')}`);

    return spawnSync('npm', args, { cwd: ROOT, encoding: 'utf8' });
}

/** true — версия опубликована, false — E404; иначе падение: без ответа реестра не публикуем. */
function isPublished(name, version) {
    const result = npm(['view', `${name}@${version}`, 'version', '--json']);
    if (result.error) {
        fail(`npm view не запустился: ${result.error.message}`);
    }
    if (result.status === 0) {
        const published = result.stdout.trim().length > 0;
        log(`npm view: ${published ? 'версия найдена' : 'пустой ответ — версии нет'}`);

        return published;
    }
    if (`${result.stdout}\n${result.stderr}`.includes('E404')) {
        log('npm view: E404 — версии нет');

        return false;
    }

    return fail(`npm view завершился с кодом ${result.status}:\n${result.stderr.trim()}`);
}

const dryRun = process.argv.includes('--dry-run');
const tag = process.env.GITHUB_REF_NAME ?? '';
log(`тег ${tag || '(пусто)'}, dry-run ${dryRun}`);

if (tag === '') {
    fail('GITHUB_REF_NAME не задан');
}
if (!TAG_PATTERN.test(tag)) {
    fail(`тег ${tag} не соответствует шаблону v<major>.<minor>.<patch>`);
}

const { name, version } = readManifest();
log(`${name} version ${version}`);
if (tag !== `v${version}`) {
    fail(`тег ${tag} не совпадает с version ${version}`);
}
if (isPublished(name, version)) {
    fail(`версия ${version} уже опубликована, перезапись запрещена`);
}

const publishArgs = ['publish', '--access', 'public', ...(dryRun ? ['--dry-run'] : [])];
log(`решение: публикуем ${name}@${version}`);
// Авторизация — только OIDC (Trusted Publishing, id-token: write): токенов в CI нет (prd.md D1, NFR-6).
log('авторизация: OIDC (Trusted Publishing)');
log(`npm ${publishArgs.join(' ')}`);
const result = spawnSync('npm', publishArgs, { cwd: ROOT, stdio: 'inherit' });
log(`npm ${publishArgs.join(' ')} завершился с кодом ${result.status}`);
process.exit(result.status ?? 1);
