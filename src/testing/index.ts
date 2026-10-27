// Точка входа "./testing" (prd.md §5.5, D2): подделка Platform для тестов потребителя. Грузится только с условием development.
export { createFakePlatform } from './fake-platform.js';
export type {
    FakeCall,
    FakeCompany,
    FakeMember,
    FakeModuleState,
    FakePlatform,
    FakePlatformOptions,
} from './fake-platform.js';
