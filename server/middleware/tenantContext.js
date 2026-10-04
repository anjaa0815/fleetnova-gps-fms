import { AsyncLocalStorage } from 'async_hooks';

// Per-request tenant context. `protect` runs the rest of the request inside it so the
// data layer can scope every query to the caller's organization without each controller
// having to remember to do so.
//
//   { orgId: '<id>' }        -> organization user: every tenant query is scoped to orgId
//   { platform: true }       -> platform (super admin): no access to tenant data
//   (no store)               -> trusted internal code (seeding, login lookups, migrations)
const storage = new AsyncLocalStorage();

export const runWithTenant = (context, fn) => storage.run(context, fn);

// Escape hatch for narrowly scoped, platform-wide checks (e.g. "is this IMEI registered anywhere?").
// Never pass user-controlled filters or return tenant documents from inside it.
export const runAsSystem = (fn) => storage.run(undefined, fn);
export const getTenantContext = () => storage.getStore() || null;
