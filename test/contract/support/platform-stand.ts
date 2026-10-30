// Стенд слоя C (prd.md §7 п. 1–5, п. 9, §10 п. 3, D10): PostgreSQL и RabbitMQ в сети Testcontainers,
// exchange verdeect.events от теста, тестовый издатель через exposeHostPorts, разовые db:prepare → migrate →
// plan:apply и сервис Platform; при сбое — ошибка с выводом упавшего контейнера.
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

/** Пароль ≥ 16 символов (PrepareEnvSchema Platform); hex — без экранирования в URL. */
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

/** Разовая команда CLI образа в сети стенда (п. 4): код 0 и {"ok":true в stdout, иначе ошибка с выводом. */
async function runCli(
    image: string,
    network: StartedNetwork,
    env: Readonly<Record<string, string>>,
    args: readonly string[],
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
            ...envArgs,
            image,
            'node',
            'dist/cli.js',
            ...args,
        ],
        { env, timeoutMs: ONE_SHOT_TIMEOUT_MS },
    );
    console.info(
        `[contract] cli ${args.join(' ')}: код ${result.code}, stdout ${result.stdout.trim()}`,
    );
    if (result.code !== 0 || !result.stdout.includes('{"ok":true')) {
        throw new Error(
            `cli ${args.join(' ')}: код ${result.code}\n--- stdout ---\n${tail(result.stdout)}\n--- stderr ---\n${tail(result.stderr)}`,
        );
    }
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
 * Готовность: GET /health Platform → 200 (FR-13: `select 1` в обоих пулах БД; 503, пока БД недоступна)
 * и подписчик очереди platform. Опрос раз в 500 мс до предела; итог — время ожидания и число опросов.
 */
async function waitReady(
    healthUrl: string,
    amqpUrl: string,
    timeoutMs: number,
): Promise<{ readonly elapsedMs: number; readonly polls: number }> {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
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
    throw new Error(
        `сервис не готов за ${timeoutMs} мс (PLATFORM_READY_TIMEOUT_MS), опросов ${polls}: ${state}`,
    );
}

/**
 * Прогрев: один POST /v1/authz/permissions с сервисным токеном до тестов — первый запрос к холодному
 * сервису (JWKS издателя, пулы БД) не попадает в проверки AC-15 (C). Результат не проверяется, сбой — warn.
 */
async function warmUp(platformUrl: string, token: string): Promise<void> {
    const startedAt = Date.now();
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
            signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
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
        await step('п. 4: db:prepare', () =>
            runCli(
                platform.image,
                startedNetwork,
                {
                    DATABASE_ADMIN_URL: adminUrl,
                    PLATFORM_OWNER_PASSWORD: ownerPassword,
                    PLATFORM_APP_PASSWORD: appPassword,
                },
                ['db:prepare'],
            ),
        );
        await step('п. 4: migrate', () =>
            runCli(platform.image, startedNetwork, { DATABASE_MIGRATOR_URL: ownerUrl }, [
                'migrate',
            ]),
        );
        await step('п. 4: plan:apply', () =>
            runCli(platform.image, startedNetwork, serviceEnv, [
                'plan:apply',
                '--file',
                'seed/plans.json',
            ]),
        );

        // Шаг 5: сервис; старт — GET /ok (живость), готовность — GET /health, подписчик очереди platform
        // и прогревочный запрос permissions.
        const timeoutMs = readyTimeoutMs();
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
                    .withStartupTimeout(timeoutMs)
                    .withLogConsumer(serviceLogs.consume)
                    .start(),
            () => serviceLogs.text(),
        );
        started.push({ name: 'platform', stop: () => service.stop() });
        const platformUrl = `http://${service.getHost()}:${service.getMappedPort(3000)}`;
        const healthUrl = `http://${service.getHost()}:${service.getMappedPort(METRICS_PORT)}/health`;
        const ready = await step(
            `п. 5: готовность ${healthUrl} (GET /health → 200 и подписчик очереди ${PLATFORM_QUEUE}, предел ${timeoutMs} мс)`,
            () => waitReady(healthUrl, amqpUrl, timeoutMs),
            () => serviceLogs.text(),
        );
        console.info(
            `[contract] п. 5: готовность за ${ready.elapsedMs} мс (опросов ${ready.polls})`,
        );
        await warmUp(platformUrl, authzToken);

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
