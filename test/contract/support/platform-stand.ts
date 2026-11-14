// Стенд слоя C (prd.md §7 п. 1–5, п. 9, §10 п. 3, D10): PostgreSQL и RabbitMQ в сети Testcontainers,
// exchange verdeect.events от теста, тестовый издатель через exposeHostPorts, подготовка БД по образу (db mode:
// kit — verdeect-kit db prepare → db move-journal → db migrate; legacy — db:prepare → migrate), plan:apply и сервис
// Platform в одном пределе PLATFORM_READY_TIMEOUT_MS; при сбое — ошибка с выводом упавшего контейнера.
import { randomBytes, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createTestSigner } from '@verdeect/auth/testing';
import amqp from 'amqplib';
import {
    GenericContainer,
    Network,
    TestContainers,
    Wait,
    type StartedNetwork,
} from 'testcontainers';
import { runProcess, tail, TAIL_LINES, type PlatformImage } from './platform-image.js';
import { readyTimeoutMs } from './ready-timeout.js';

const POSTGRES_IMAGE = 'postgres:17.11-alpine3.24';
const RABBITMQ_IMAGE = 'rabbitmq:4.3.6-management-alpine';
const EVENTS_EXCHANGE = 'verdeect.events';
const PLATFORM_QUEUE = 'platform';
const TEST_ISS = 'https://test-identity.verdeect.invalid';
const RESOURCE = 'https://api.verdeect.ru';
/** Сервис-потребитель пакета в токенах слоя C (§7 п. 8). */
const SERVICE_CLIENT_ID = 'verdeect-files';
/** Старт контейнера RabbitMQ (ожидание строки лога). */
const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;
/** Порт /health и /metrics Platform (METRICS_PORT, отдельный сервер HTTP-входа). */
const METRICS_PORT = 9100;
/** Шаг опроса готовности. */
const READY_STEP_MS = 500;
/**
 * Предел одного запроса GET /health: пробы Platform ограничены 2 с (PROBE_TIMEOUT_MS Platform),
 * зависший запрос не переживает дедлайн готовности.
 */
const PROBE_TIMEOUT_MS = 5_000;
/** Предел прогревочного POST /v1/authz/permissions: первый запрос загружает JWKS издателя и пулы БД. */
const WARMUP_TIMEOUT_MS = 30_000;
const ONE_SHOT_TIMEOUT_MS = 120_000;
/** Рабочий каталог образа Platform: dist/cli.js и node_modules/.bin/verdeect-kit (docs/deployment.md Platform). */
const PLATFORM_WORKDIR = '/app/apps/platform';
/** CLI пакета @verdeect/kit в образе Platform @ 91b0123+. */
const KIT_BIN = 'node_modules/.bin/verdeect-kit';
const TOKEN_LIFETIME_SEC = 3600;

/** Поднятый стенд: адреса для тестов и остановка. */
export interface PlatformStand {
    /** HTTP Platform с хоста (проброшенный порт 3000). */
    readonly platformUrl: string;
    /** AMQP с хоста (проброшенный порт 5672). */
    readonly amqpUrl: string;
    /** id контейнера сервиса для docker exec / docker logs. */
    readonly serviceContainerId: string;
    /** Сервисный токен с областью platform:authz, срок 1 ч. */
    readonly authzToken: string;
    /** Тот же токен без области. */
    readonly noScopeToken: string;
    stop(): Promise<void>;
}

/**
 * Пароль ≥ 16 символов (kit: DB_OWNER_PASSWORD / DB_APP_PASSWORD; legacy: PrepareEnvSchema Platform);
 * hex — без экранирования в URL.
 */
function secret(): string {
    return randomBytes(16).toString('hex');
}

/** URL без пароля для лога. */
export function redact(url: string): string {
    const parsed = new URL(url);
    if (parsed.password !== '') {
        parsed.password = '***';
    }

    return parsed.toString();
}

/**
 * amqplib в главном процессе Vitest: хук prepareStackTrace раннера vite падает на стеках amqplib —
 * на время вызова он снимается (как globalSetup Platform).
 */
async function withoutStackHook<T>(work: () => Promise<T>): Promise<T> {
    const errorClass = Error as { prepareStackTrace?: unknown };
    const saved = errorClass.prepareStackTrace;
    errorClass.prepareStackTrace = undefined;
    try {
        return await work();
    } finally {
        errorClass.prepareStackTrace = saved;
    }
}

/** Последние строки лога контейнера в памяти: контейнер может исчезнуть раньше, чем их прочтут. */
class LogBuffer {
    private lines: string[] = [];

    consume = (stream: Readable): void => {
        stream.on('data', (line: Buffer | string) => {
            this.lines.push(String(line).trimEnd());
            if (this.lines.length > TAIL_LINES) {
                this.lines.shift();
            }
        });
    };

    text(): string {
        return this.lines.join('\n');
    }
}

/** Шаг стенда: лог начала и обёртка ошибки с именем шага (п. 9). */
async function step<T>(name: string, work: () => Promise<T>, logs?: () => string): Promise<T> {
    console.info(`[contract] ${name}…`);
    try {
        const result = await work();
        console.info(`[contract] ${name}: готово`);

        return result;
    } catch (error) {
        const output = logs?.() ?? '';
        throw new Error(
            `[contract] шаг «${name}» упал: ${error instanceof Error ? error.message : String(error)}` +
                (output === '' ? '' : `\n--- вывод контейнера ---\n${output}`),
            { cause: error },
        );
    }
}

/** Форма подготовки БД (п. 4): kit — CLI @verdeect/kit (Platform @ 91b0123+), legacy — dist/cli.js db:prepare. */
export type DbMode = 'kit' | 'legacy';

/** Правило проверки разовой команды (п. 4): ok — {"ok":true в stdout (CLI Platform), no-error — kit. */
type OneShotCheck = 'ok' | 'no-error';

/** Форма по коду проверки наличия verdeect-kit в образе: 0 — kit, 1 — legacy, иное — ошибка. */
export function dbModeOf(code: number): DbMode {
    if (code === 0) {
        return 'kit';
    }
    if (code === 1) {
        return 'legacy';
    }
    throw new Error(`проверка ${KIT_BIN}: неожиданный код ${code}`);
}

/** Итог команды kit (п. 4): код 0 и ни одна JSON-строка stdout не содержит поля error. */
export function kitOutputOk(code: number, stdout: string): boolean {
    if (code !== 0) {
        return false;
    }

    return !stdout.split('\n').some((line) => {
        const text = line.trim();
        if (!text.startsWith('{')) {
            return false;
        }
        try {
            const parsed: unknown = JSON.parse(text);

            return typeof parsed === 'object' && parsed !== null && 'error' in parsed;
        } catch {
            return false;
        }
    });
}

function outputOk(check: OneShotCheck, code: number, stdout: string): boolean {
    if (check === 'no-error') {
        return kitOutputOk(code, stdout);
    }

    return code === 0 && stdout.includes('{"ok":true');
}

/** Ошибка разовой команды с хвостами вывода (п. 9). */
function oneShotError(name: string, code: number, stdout: string, stderr: string): Error {
    return new Error(
        `${name}: код ${code}\n--- stdout ---\n${tail(stdout)}\n--- stderr ---\n${tail(stderr)}`,
    );
}

/** Разовая команда образа в сети стенда (п. 4); итог проверяется правилом check, иначе ошибка с выводом. */
async function runOneShot(
    image: string,
    network: StartedNetwork,
    env: Readonly<Record<string, string>>,
    argv: readonly string[],
    check: OneShotCheck,
): Promise<void> {
    // -e KEY без значения: Docker берёт значение из окружения процесса, секретов нет в argv и в логе.
    const envArgs = Object.keys(env).flatMap((key) => ['-e', key]);
    const result = await runProcess(
        'docker',
        [
            'run',
            '--rm',
            '--network',
            network.getName(),
            '-w',
            PLATFORM_WORKDIR,
            ...envArgs,
            image,
            ...argv,
        ],
        { env, timeoutMs: ONE_SHOT_TIMEOUT_MS },
    );
    const name = argv.join(' ');
    console.info(`[contract] cli ${name}: код ${result.code}, stdout ${result.stdout.trim()}`);
    if (!outputOk(check, result.code, result.stdout)) {
        throw oneShotError(`cli ${name}`, result.code, result.stdout, result.stderr);
    }
}

/** Форма подготовки БД по образу (решение плана E5): есть node_modules/.bin/verdeect-kit — kit. */
async function detectDbMode(image: string): Promise<DbMode> {
    const script = `process.exit(require('node:fs').existsSync('${KIT_BIN}')?0:1)`;
    const result = await runProcess(
        'docker',
        ['run', '--rm', '-w', PLATFORM_WORKDIR, image, 'node', '-e', script],
        { timeoutMs: ONE_SHOT_TIMEOUT_MS },
    );
    try {
        const mode = dbModeOf(result.code);
        console.info(`[contract] db mode: ${mode}`);

        return mode;
    } catch (error) {
        throw oneShotError(
            error instanceof Error ? error.message : String(error),
            result.code,
            result.stdout,
            result.stderr,
        );
    }
}

/** Шаг 4 (§7): подготовка БД формой mode и plan:apply. */
async function prepareDatabase(
    mode: DbMode,
    image: string,
    network: StartedNetwork,
    urls: { readonly admin: string; readonly owner: string },
    passwords: { readonly owner: string; readonly app: string },
    serviceEnv: Readonly<Record<string, string>>,
): Promise<void> {
    const migratorEnv = { DATABASE_MIGRATOR_URL: urls.owner };
    if (mode === 'kit') {
        await step('п. 4: verdeect-kit db prepare', () =>
            runOneShot(
                image,
                network,
                {
                    DATABASE_ADMIN_URL: urls.admin,
                    DB_OWNER_PASSWORD: passwords.owner,
                    DB_APP_PASSWORD: passwords.app,
                },
                [KIT_BIN, 'db', 'prepare', '--service', 'platform'],
                'no-error',
            ),
        );
        await step('п. 4: verdeect-kit db move-journal', () =>
            runOneShot(
                image,
                network,
                migratorEnv,
                [KIT_BIN, 'db', 'move-journal', '--from', 'drizzle', '--to', 'platform'],
                'no-error',
            ),
        );
        await step('п. 4: verdeect-kit db migrate', () =>
            runOneShot(
                image,
                network,
                migratorEnv,
                [KIT_BIN, 'db', 'migrate', '--folder', 'drizzle', '--schema', 'platform'],
                'no-error',
            ),
        );
    } else {
        await step('п. 4: db:prepare', () =>
            runOneShot(
                image,
                network,
                {
                    DATABASE_ADMIN_URL: urls.admin,
                    PLATFORM_OWNER_PASSWORD: passwords.owner,
                    PLATFORM_APP_PASSWORD: passwords.app,
                },
                ['node', 'dist/cli.js', 'db:prepare'],
                'ok',
            ),
        );
        await step('п. 4: migrate', () =>
            runOneShot(image, network, migratorEnv, ['node', 'dist/cli.js', 'migrate'], 'ok'),
        );
    }
    await step('п. 4: plan:apply', () =>
        runOneShot(
            image,
            network,
            serviceEnv,
            ['node', 'dist/cli.js', 'plan:apply', '--file', 'seed/plans.json'],
            'ok',
        ),
    );
}

/** Готовность (решение плана): очередь platform есть и у неё есть подписчик. */
async function platformQueueConsumers(amqpUrl: string): Promise<string> {
    return withoutStackHook(async () => {
        const connection = await amqp.connect(amqpUrl);
        connection.on('error', () => undefined);
        try {
            // Свой канал на попытку: 404 закрывает канал и приходит событием 'error' (withProbe Platform).
            const probe = await connection.createChannel();
            probe.on('error', () => undefined);
            try {
                const { consumerCount } = await probe.checkQueue(PLATFORM_QUEUE);

                return consumerCount >= 1 ? 'ready' : 'consumerCount = 0';
            } catch {
                return 'нет очереди platform';
            } finally {
                await probe.close().catch(() => undefined);
            }
        } finally {
            await connection.close().catch(() => undefined);
        }
    });
}

/**
 * Текст ошибки готовности (п. 5, п. 9): заданный предел и остаток после старта контейнера; без опросов —
 * предел исчерпан на старте контейнера.
 */
export function notReadyMessage(
    limitMs: number,
    remainingMs: number,
    polls: number,
    state: string,
): string {
    if (polls === 0) {
        return `Platform не готов: предел PLATFORM_READY_TIMEOUT_MS=${limitMs} мс исчерпан на старте контейнера`;
    }

    return `Platform не готов: предел PLATFORM_READY_TIMEOUT_MS=${limitMs} мс, остаток ${remainingMs} мс истёк, опросов ${polls}: ${state}`;
}

/**
 * Готовность: GET /health Platform → 200 (FR-13: `select 1` в обоих пулах БД; 503, пока БД недоступна)
 * и подписчик очереди platform. Опрос раз в 500 мс до остатка remainingMs общего предела limitMs; итог —
 * время ожидания и число опросов.
 */
async function waitReady(
    healthUrl: string,
    amqpUrl: string,
    limitMs: number,
    remainingMs: number,
): Promise<{ readonly elapsedMs: number; readonly polls: number }> {
    const startedAt = Date.now();
    const deadline = startedAt + remainingMs;
    let state = 'не опрошен';
    let polls = 0;
    while (Date.now() < deadline) {
        polls += 1;
        const health = await fetch(healthUrl, {
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }).then(
            (response) => response.status,
            () => 0,
        );
        state = health === 200 ? await platformQueueConsumers(amqpUrl) : `GET /health → ${health}`;
        if (state === 'ready') {
            return { elapsedMs: Date.now() - startedAt, polls };
        }
        await new Promise((resolve) => setTimeout(resolve, READY_STEP_MS));
    }
    throw new Error(notReadyMessage(limitMs, remainingMs, polls, state));
}

/**
 * Прогрев: один POST /v1/authz/permissions с сервисным токеном до тестов — первый запрос к холодному
 * сервису (JWKS издателя, пулы БД) не попадает в проверки AC-15 (C). Результат не проверяется, сбой — warn.
 */
async function warmUp(platformUrl: string, token: string, budgetMs: number): Promise<void> {
    const startedAt = Date.now();
    if (budgetMs <= 0) {
        console.warn('[contract] WARN прогрев пропущен: предел PLATFORM_READY_TIMEOUT_MS исчерпан');

        return;
    }
    try {
        const response = await fetch(`${platformUrl}/v1/authz/permissions`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({
                sub: 'contract-warmup',
                tenant: 'contract-warmup',
                tenantId: randomUUID(),
                act: 'human',
            }),
            signal: AbortSignal.timeout(Math.min(WARMUP_TIMEOUT_MS, budgetMs)),
        });
        await response.text();
        console.info(
            `[contract] п. 5: прогрев POST /v1/authz/permissions → ${response.status} за ${Date.now() - startedAt} мс`,
        );
    } catch (error) {
        console.warn(
            `[contract] WARN прогрев POST /v1/authz/permissions за ${Date.now() - startedAt} мс: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/** Остановка без падения: ошибки — warn. */
async function quietly(name: string, work: () => Promise<unknown>): Promise<void> {
    try {
        await work();
        console.info(`[contract] остановлен: ${name}`);
    } catch (error) {
        console.warn(
            `[contract] WARN остановка ${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/** Поднимает стенд §7 по шагам 1–5; при сбое останавливает уже запущенное. */
export async function startPlatformStand(platform: PlatformImage): Promise<PlatformStand> {
    // Запущенное — в обратном порядке остановки: сервис, rabbitmq, postgres, сеть, издатель.
    const started: Array<{ readonly name: string; readonly stop: () => Promise<unknown> }> = [];
    const stop = async (): Promise<void> => {
        for (const item of started.splice(0).reverse()) {
            await quietly(item.name, item.stop);
        }
    };

    try {
        // Шаг 1: сеть, PostgreSQL и RabbitMQ.
        const rabbitUser = 'contract';
        const rabbitPassword = secret();
        const rabbitLogs = new LogBuffer();
        const startedNetwork = await step('п. 1: сеть Testcontainers', () => new Network().start());
        started.push({ name: 'network', stop: () => startedNetwork.stop() });
        const [pg, mq] = await step(
            'п. 1: PostgreSQL и RabbitMQ',
            () =>
                Promise.all([
                    new PostgreSqlContainer(POSTGRES_IMAGE)
                        .withNetwork(startedNetwork)
                        .withNetworkAliases('postgres')
                        .withPassword(secret())
                        .start(),
                    new GenericContainer(RABBITMQ_IMAGE)
                        .withNetwork(startedNetwork)
                        .withNetworkAliases('rabbitmq')
                        .withEnvironment({
                            RABBITMQ_DEFAULT_USER: rabbitUser,
                            RABBITMQ_DEFAULT_PASS: rabbitPassword,
                        })
                        .withExposedPorts(5672)
                        .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
                        .withStartupTimeout(CONTAINER_STARTUP_TIMEOUT_MS)
                        .withLogConsumer(rabbitLogs.consume)
                        .start(),
                ]),
            () => rabbitLogs.text(),
        );
        started.push({ name: 'postgres', stop: () => pg.stop() });
        started.push({ name: 'rabbitmq', stop: () => mq.stop() });
        const adminUrl = `postgres://${pg.getUsername()}:${pg.getPassword()}@postgres:5432/${pg.getDatabase()}`;
        const amqpUrl = `amqp://${rabbitUser}:${rabbitPassword}@${mq.getHost()}:${mq.getMappedPort(5672)}`;
        const innerAmqpUrl = `amqp://${rabbitUser}:${rabbitPassword}@rabbitmq:5672`;
        console.info(`[contract] PostgreSQL ${redact(adminUrl)}, RabbitMQ ${redact(amqpUrl)}`);

        // Шаг 2: exchange принадлежит Identity, Platform его только проверяет — объявляет тест.
        await step(`п. 2: exchange ${EVENTS_EXCHANGE}`, () =>
            withoutStackHook(async () => {
                const connection = await amqp.connect(amqpUrl);
                try {
                    const channel = await connection.createChannel();
                    await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
                } finally {
                    await connection.close();
                }
            }),
        );

        // Шаг 3: тестовый издатель; JWKS доступен контейнерам через exposeHostPorts (Task 1, §10 п. 3).
        const signer = await step('п. 3: тестовый издатель', () =>
            createTestSigner({ iss: TEST_ISS, kinds: ['service'] }),
        );
        // Издатель останавливается последним: стек — в обратном порядке, поэтому он первым в начале.
        started.unshift({ name: 'издатель', stop: () => signer.close() });
        const jwksPort = Number(new URL(signer.issuer.jwksUri).port);
        await step(`п. 3: exposeHostPorts ${jwksPort}`, () =>
            TestContainers.exposeHostPorts(jwksPort),
        );
        const jwksUri = `http://host.testcontainers.internal:${jwksPort}/jwks`;
        const exp = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SEC;
        const claims = { sub: SERVICE_CLIENT_ID, client_id: SERVICE_CLIENT_ID, exp };
        const authzToken = await signer.serviceToken({ ...claims, scope: 'platform:authz' });
        const noScopeToken = await signer.serviceToken({ ...claims, scope: undefined });
        console.info(
            `[contract] издатель ${TEST_ISS}, jwksUri ${jwksUri}, токены ${SERVICE_CLIENT_ID} (с platform:authz и без области)`,
        );

        // Шаг 4: разовые команды образа, по очереди.
        const ownerPassword = secret();
        const appPassword = secret();
        const ownerUrl = `postgres://platform_owner:${ownerPassword}@postgres:5432/${pg.getDatabase()}`;
        const appUrl = `postgres://platform_app:${appPassword}@postgres:5432/${pg.getDatabase()}`;
        const serviceEnv: Record<string, string> = {
            NODE_ENV: 'test',
            DATABASE_URL: appUrl,
            DATABASE_MIGRATOR_URL: ownerUrl,
            RABBITMQ_URL: innerAmqpUrl,
            RABBITMQ_RETRY_SECONDS: '1',
            AUTH_ISSUERS: JSON.stringify([{ iss: TEST_ISS, jwksUri, kinds: ['service'] }]),
            AUTH_RESOURCE: RESOURCE,
            MODULES_READY: 'files,web,office,images',
            REPLICA_ID: 'contract',
        };
        const dbMode = await step('п. 4: форма подготовки БД', () => detectDbMode(platform.image));
        await prepareDatabase(
            dbMode,
            platform.image,
            startedNetwork,
            { admin: adminUrl, owner: ownerUrl },
            { owner: ownerPassword, app: appPassword },
            serviceEnv,
        );

        // Шаг 5: сервис; старт — GET /ok (живость), готовность — GET /health, подписчик очереди platform
        // и прогревочный запрос permissions — в одном пределе PLATFORM_READY_TIMEOUT_MS (решение плана E5).
        const timeoutMs = readyTimeoutMs();
        const deadline = Date.now() + timeoutMs;
        const remaining = (): number => Math.max(0, deadline - Date.now());
        const serviceLogs = new LogBuffer();
        const service = await step(
            'п. 5: сервис Platform',
            () =>
                new GenericContainer(platform.image)
                    .withNetwork(startedNetwork)
                    .withNetworkAliases('platform')
                    .withEnvironment({ ...serviceEnv, METRICS_PORT: String(METRICS_PORT) })
                    .withExposedPorts(3000, METRICS_PORT)
                    .withWaitStrategy(Wait.forHttp('/ok', 3000).forStatusCode(200))
                    .withStartupTimeout(remaining())
                    .withLogConsumer(serviceLogs.consume)
                    .start(),
            () => serviceLogs.text(),
        );
        started.push({ name: 'platform', stop: () => service.stop() });
        const platformUrl = `http://${service.getHost()}:${service.getMappedPort(3000)}`;
        const healthUrl = `http://${service.getHost()}:${service.getMappedPort(METRICS_PORT)}/health`;
        const ready = await step(
            `п. 5: готовность ${healthUrl} (GET /health → 200 и подписчик очереди ${PLATFORM_QUEUE}, предел ${timeoutMs} мс)`,
            () => waitReady(healthUrl, amqpUrl, timeoutMs, remaining()),
            () => serviceLogs.text(),
        );
        console.info(
            `[contract] п. 5: готовность за ${ready.elapsedMs} мс (опросов ${ready.polls})`,
        );
        await warmUp(platformUrl, authzToken, remaining());

        return {
            platformUrl,
            amqpUrl,
            serviceContainerId: service.getId(),
            authzToken,
            noScopeToken,
            stop,
        };
    } catch (error) {
        await stop();
        throw error;
    }
}
