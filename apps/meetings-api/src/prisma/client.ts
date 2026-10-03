/**
 * Single entry point to the meetings Prisma client, generated into
 * apps/meetings-api/generated/prisma (see prisma/schema.prisma) so it never
 * clashes with the Institutional Kernel's own @prisma/client.
 *
 * `Role` is not a database enum any more: it is computed per request from the
 * kernel directory (see auth/role-resolution.ts). It is re-exported here so the
 * ported legacy code keeps importing it from the same place as the enums.
 */
export * from '../../generated/prisma';
export { Role } from '../auth/role';
