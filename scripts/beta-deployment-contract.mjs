// Deliberately closed contract for the existing card-free beta template.
// Config evolution requires an explicit reviewed contract change, not extra Wrangler keys.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const sameArray = (value, expected) => Array.isArray(value) && value.length === expected.length && expected.every((item, i) => value[i] === item);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const rates = [
  ['DEVICE_RATE', '51001', 120], ['PAIR_RATE', '51002', 20],
  ['PARENT_HISTORY_RATE', '51003', 60], ['PARENT_WS_RATE', '51004', 30],
  ['PARENT_GEOCODE_RATE', '51005', 120], ['PARENT_COMMUTE_RATE', '51006', 30],
  ['BETA_RATE', '51007', 10], ['BETA_PARENT_RATE', '51008', 60],
  ['PARENT_LOGIN_RATE', '51009', 6],
];
export function validateBetaConfig(c, {rendered = false} = {}) {
  const fail = () => { throw Error('Refuse configuration outside isolated D1/card-free beta'); };
  if (typeof rendered !== 'boolean' || !exact(c, ['$schema', 'name', 'main', 'compatibility_date', 'workers_dev', 'observability', 'assets', 'durable_objects', 'migrations', 'd1_databases', 'ratelimits', 'vars', 'triggers'])) fail();
  if (c.$schema !== './node_modules/wrangler/config-schema.json' || c.name !== 'brick-family-beta' || c.main !== 'src/worker-beta-cardfree.ts' || c.compatibility_date !== '2026-10-29' || c.workers_dev !== true) fail();
  if (!exact(c.observability, ['enabled']) || c.observability.enabled !== false || !exact(c.assets, ['directory']) || c.assets.directory !== './public' || !exact(c.triggers, ['crons']) || !sameArray(c.triggers.crons, [])) fail();
  if (!exact(c.vars, ['APP_ENV', 'CURRENT_APP_VERSION', 'BETA_CHANNEL', 'BETA_SOURCE_SHA', 'DEV_PARENT_AUTH_MODE', 'BETA_STORAGE_MODE', 'BRICK_MAP_SOURCE']) || c.vars.APP_ENV !== 'development' || c.vars.CURRENT_APP_VERSION !== '1.0.0-beta.1' || c.vars.BETA_CHANNEL !== 'beta' || c.vars.DEV_PARENT_AUTH_MODE !== 'd1-session-v1' || c.vars.BETA_STORAGE_MODE !== 'd1') fail();
  if (rendered) {
    if (typeof c.vars.BETA_SOURCE_SHA !== 'string' || !/^[a-f0-9]{40}$/.test(c.vars.BETA_SOURCE_SHA) || typeof c.vars.BRICK_MAP_SOURCE !== 'string' || !/^https:\/\/build\.protomaps\.com\/[0-9]{8}\.pmtiles$/.test(c.vars.BRICK_MAP_SOURCE)) fail();
  } else if (c.vars.BETA_SOURCE_SHA !== '__BETA_SOURCE_SHA__' || c.vars.BRICK_MAP_SOURCE !== '__BRICK_MAP_SOURCE__') fail();
  if (!Array.isArray(c.migrations) || c.migrations.length !== 2) fail();
  for (const [i, tag, className] of [[0, 'v1', 'BrickDevice'], [1, 'beta-scheduler-v1', 'BetaScheduler']]) {
    const migration = c.migrations[i];
    if (!exact(migration, ['tag', 'new_sqlite_classes']) || migration.tag !== tag || !sameArray(migration.new_sqlite_classes, [className])) fail();
  }
  if (!exact(c.durable_objects, ['bindings']) || !Array.isArray(c.durable_objects.bindings) || c.durable_objects.bindings.length !== 2) fail();
  for (const [name, className] of [['BRICK_DEVICE', 'BrickDevice'], ['BETA_SCHEDULER', 'BetaScheduler']]) {
    const binding = c.durable_objects.bindings.find(x => x?.name === name);
    if (!exact(binding, ['name', 'class_name']) || binding.class_name !== className) fail();
  }
  if (!Array.isArray(c.d1_databases) || c.d1_databases.length !== 2) fail();
  const databases = [];
  for (const [name, databaseName, placeholder] of [['DB', 'brick-family-beta', '__D1_DATABASE_ID__'], ['BETA_DB', 'brick-family-beta-diagnostics', '__BETA_D1_DATABASE_ID__']]) {
    const database = c.d1_databases.find(x => x?.binding === name);
    if (!exact(database, ['binding', 'database_name', 'database_id']) || database.database_name !== databaseName || typeof database.database_id !== 'string' || (rendered ? !uuid.test(database.database_id) : database.database_id !== placeholder)) fail();
    databases.push(database.database_id.toLowerCase());
  }
  if (databases[0] === databases[1]) fail();
  if (!Array.isArray(c.ratelimits) || c.ratelimits.length !== rates.length) fail();
  for (const [name, namespace, limit] of rates) {
    const rate = c.ratelimits.find(x => x?.name === name);
    if (!exact(rate, ['name', 'namespace_id', 'simple']) || rate.namespace_id !== namespace || !exact(rate.simple, ['limit', 'period']) || rate.simple.limit !== limit || rate.simple.period !== 60) fail();
  }
  return true;
}
