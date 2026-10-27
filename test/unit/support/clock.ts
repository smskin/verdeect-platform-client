// Подделанные часы слоя U (prd.md §7): время двигается только тестом.

export interface TestClock {
    readonly now: () => number;
    advance(ms: number): void;
    set(ms: number): void;
}

export function createClock(startMs = 0): TestClock {
    let current = startMs;
    return {
        now: () => current,
        advance(ms) {
            current += ms;
        },
        set(ms) {
            current = ms;
        },
    };
}
