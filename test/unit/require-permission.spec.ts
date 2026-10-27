// AC-10, D11 (prd.md §5.4): @RequirePermission — TypeError при объявлении без прав, метаданные прав и PermissionGuard.
import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { PermissionGuard, RequirePermission } from '../../src/nest/index.js';
import { REQUIRED_PERMISSIONS } from '../../src/nest/permission.guard.js';
import { createFakePlatform } from '../../src/testing/index.js';

describe('AC-10: @RequirePermission — ошибка объявления', () => {
    it('AC-10: @RequirePermission() → TypeError при объявлении класса', () => {
        expect(() => {
            @Controller('x')
            class Declared {
                @Get()
                @RequirePermission()
                handle(): void {}
            }
            return Declared;
        }).toThrow(TypeError);
    });

    it.each([[['']], [['chat.use', '']]])(
        "AC-10: @RequirePermission('') и ('a', '') → TypeError при объявлении (%j)",
        (permissions) => {
            expect(() => RequirePermission(...permissions)).toThrow(
                /@RequirePermission\(\) requires/,
            );
        },
    );

    it("AC-10: при TypeError объявления класса с @RequirePermission() и @RequirePermission('') Platform не вызывается", () => {
        const fake = createFakePlatform();
        fake.grant('org_acme', 'acc_1', ['chat.use']);
        for (const permissions of [[], ['']]) {
            expect(() => {
                @Controller('x')
                class Declared {
                    @Get()
                    @RequirePermission(...permissions)
                    handle(): void {}
                }
                return Declared;
            }).toThrow(TypeError);
        }
        expect(fake.calls()).toStrictEqual([]);
    });
});

describe('D11: метаданные @RequirePermission', () => {
    it('D11: метаданные — права и PermissionGuard в guards метода и класса', () => {
        @RequirePermission('chat.use')
        class Target {
            @RequirePermission('native.files.read', 'native.files.write')
            handle(): void {}
        }
        const method = Object.getOwnPropertyDescriptor(Target.prototype, 'handle')?.value as object;
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, Target)).toStrictEqual(['chat.use']);
        expect(Reflect.getMetadata(GUARDS_METADATA, Target)).toStrictEqual([PermissionGuard]);
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, method)).toStrictEqual([
            'native.files.read',
            'native.files.write',
        ]);
        expect(Reflect.getMetadata(GUARDS_METADATA, method)).toStrictEqual([PermissionGuard]);
    });
});
