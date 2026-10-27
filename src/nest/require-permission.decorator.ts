// @RequirePermission (prd.md §5.4, D11, AC-10): метаданные прав + UseGuards(PermissionGuard); пустой список — TypeError при объявлении.
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { PermissionGuard, REQUIRED_PERMISSIONS } from './permission.guard.js';

/**
 * Права маршрута; на классе и методе. Несколько прав — обязательны все, права класса и метода
 * складываются. Ставит `PermissionGuard` только на этот маршрут (D11).
 *
 * Порядок с `@UseGuards(VerdeectAuthGuard)` на одном методе: `@UseGuards` — ниже
 * `@RequirePermission`. Иначе `VerdeectAuthGuard` сработает после `PermissionGuard` и проверит
 * токен второй раз.
 * @param permissions Права каталога Platform, хотя бы одно, без пустых строк.
 * @returns Декоратор класса и метода.
 * @throws TypeError при объявлении без прав или с пустой строкой.
 * @example
 * ```ts
 * @Get(':id')
 * @RequirePermission('native.files.read')
 * @UseGuards(VerdeectAuthGuard)
 * read() {}
 * ```
 */
export function RequirePermission(...permissions: string[]): ClassDecorator & MethodDecorator {
    if (permissions.length === 0 || permissions.some((p) => typeof p !== 'string' || p === '')) {
        throw new TypeError(
            'platform-client: @RequirePermission() requires at least one non-empty permission',
        );
    }
    return applyDecorators(
        SetMetadata(REQUIRED_PERMISSIONS, permissions),
        UseGuards(PermissionGuard),
    );
}
