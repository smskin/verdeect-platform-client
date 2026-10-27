// Брокер слоя C (prd.md §7 п. 6–7, п. 9, AC-15 C): очередь теста на platform.policy.changed с проверкой
// каждого события ajv по копии схемы и zod пакета; публикация identity.* после проверки конверта.
import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { inject } from 'vitest';
import { createPlatformAuthzClient } from '../../../src/core/index.js';
import {
    fixtureSchemaValidator,
    validateIdentityEnvelope,
    type IdentityEnvelope,
} from './identity-events.js';
import { serviceLogsTail } from './platform-cli.js';

const EVENTS_EXCHANGE = 'verdeect.events';
const POLICY_CHANGED = 'platform.policy.changed';
/** Предел ожидания результата (§7 п. 7). */
const EVENT_TIMEOUT_MS = 5_000;

const validatePlatformEvent = fixtureSchemaValidator('platform-events.schema.json');

/** Данные platform.policy.changed (§3.3). */
export interface PolicyChangedData {
    readonly tenantId: string;
    readonly epoch: number;
    readonly reason: string;
    readonly subs?: readonly string[];
}

/** Полученное сообщение и итог проверок AC-15 (C); у нечитаемого сообщения id и data нет. */
export interface ReceivedPolicyChanged {
    readonly envelope: { readonly id?: string; readonly data?: PolicyChangedData };
    /** Ошибки ajv по копии platform-events.schema.json; пусто — проходит. */
    readonly ajvErrors: readonly string[];
    /** Конверт принят zod пакета (метрика policyEvent ≠ invalid). */
    readonly zodValid: boolean;
}

/** Событие с данными: его возвращает {@link ContractBroker.nextPolicyChanged}. */
export interface PolicyChangedEvent extends ReceivedPolicyChanged {
    readonly envelope: { readonly id?: string; readonly data: PolicyChangedData };
}

function hasData(message: ReceivedPolicyChanged): message is PolicyChangedEvent {
    return typeof message.envelope.data === 'object' && message.envelope.data !== null;
}

/**
 * Проверка zod пакета через публичный API: отдельный клиент, onPolicyChanged и метрика policyEvent.
 * Platform клиент не вызывает — tokenProvider и baseUrl не используются.
 */
function zodAccepts(envelope: unknown): boolean {
    let result: string | undefined;
    const probe = createPlatformAuthzClient({
        baseUrl: 'http://127.0.0.1:9',
        tokenProvider: { getToken: () => Promise.reject(new Error('не используется')) },
        metrics: {
            cacheResult: () => undefined,
            request: () => undefined,
            policyEvent: (value) => {
                result = value;
            },
        },
    });
    probe.onPolicyChanged(envelope);

    return result !== undefined && result !== 'invalid';
}

/** Подключение теста к брокеру стенда. */
export class ContractBroker {
    /** Все события platform.policy.changed очереди теста по порядку. */
    readonly received: ReceivedPolicyChanged[] = [];

    private constructor(
        private readonly connection: ChannelModel,
        private readonly channel: Channel,
    ) {}

    static async connect(): Promise<ContractBroker> {
        const connection = await amqp.connect(inject('amqpUrl'));
        const channel = await connection.createChannel();

        return new ContractBroker(connection, channel);
    }

    /** п. 6: эксклюзивная очередь с автоименем на platform.policy.changed; до первого действия теста. */
    async captureQueue(): Promise<void> {
        const { queue } = await this.channel.assertQueue('', { exclusive: true, durable: false });
        await this.channel.bindQueue(queue, EVENTS_EXCHANGE, POLICY_CHANGED);
        await this.channel.consume(queue, (message) => this.onMessage(message), { noAck: true });
        console.info(`[contract] очередь теста ${queue} ← ${POLICY_CHANGED}`);
    }

    /** Отметка: события, полученные после неё, ищет {@link nextPolicyChanged}. */
    mark(): number {
        return this.received.length;
    }

    /** Первое событие после отметки from, подходящее под predicate; не дольше 5 с (п. 7). */
    async nextPolicyChanged(
        predicate: (data: PolicyChangedData) => boolean,
        from = 0,
    ): Promise<PolicyChangedEvent> {
        const deadline = Date.now() + EVENT_TIMEOUT_MS;
        while (Date.now() < deadline) {
            const found = this.received
                .slice(from)
                .filter(hasData)
                .find((m) => predicate(m.envelope.data));
            if (found !== undefined) {
                return found;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(
            `[contract] нет ${POLICY_CHANGED} за ${EVENT_TIMEOUT_MS / 1000} с; получены:\n` +
                `${JSON.stringify(this.received.slice(from).map((m) => m.envelope.data))}\n` +
                `--- docker logs сервиса ---\n${await serviceLogsTail(inject('serviceContainerId'))}`,
        );
    }

    /** Публикация identity.* как Identity: конверт сначала проверяется копией схемы. */
    publishIdentity(envelope: IdentityEnvelope): void {
        const errors = validateIdentityEnvelope(envelope);
        if (errors.length > 0) {
            throw new Error(
                `[contract] конверт ${envelope.type} не проходит копию схемы: ${errors.join('; ')}`,
            );
        }
        this.channel.publish(
            EVENTS_EXCHANGE,
            envelope.type,
            Buffer.from(JSON.stringify(envelope)),
            {
                messageId: envelope.id,
                type: envelope.type,
                persistent: true,
                contentType: 'application/json',
            },
        );
        console.info(`[contract] опубликовано ${envelope.type} ${envelope.id}`);
    }

    async close(): Promise<void> {
        await this.connection.close().catch(() => undefined);
    }

    private onMessage(message: ConsumeMessage | null): void {
        if (message === null) {
            return;
        }
        this.received.push(inspectPolicyChanged(message.content.toString()));
    }
}

/**
 * Разбор тела platform.policy.changed из очереди теста и проверки AC-15 (C). Не бросает: нечитаемое
 * сообщение (не JSON, нет data) попадает в received с ошибками, и AC-15 (C) падает своим сообщением.
 */
export function inspectPolicyChanged(content: string): ReceivedPolicyChanged {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
            `[contract] WARN ${POLICY_CHANGED} не JSON: Platform изменил схему — обновить копию (спросить пользователя): ${reason}`,
        );

        return { envelope: {}, ajvErrors: [`не JSON: ${reason}`], zodValid: false };
    }
    // Проверки — до чтения data: конверт другой формы не должен ронять колбэк consume.
    const ajvErrors = validatePlatformEvent(parsed);
    const zodValid = zodAccepts(parsed);
    const envelope = (
        typeof parsed === 'object' && parsed !== null ? parsed : {}
    ) as ReceivedPolicyChanged['envelope'];
    const data = envelope.data;
    console.info(
        `[contract] получено ${POLICY_CHANGED} tenantId=${String(data?.tenantId)} epoch=${String(data?.epoch)} subs=${JSON.stringify(data?.subs ?? null)} reason=${String(data?.reason)}`,
    );
    if (ajvErrors.length > 0) {
        console.warn(
            `[contract] WARN ${String(envelope.id)} не проходит ajv: Platform изменил схему — обновить копию (спросить пользователя): ${ajvErrors.join('; ')}`,
        );
    }

    return { envelope, ajvErrors, zodValid };
}
