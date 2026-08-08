const UPSERT_CONFLICT = {
  admin_permissions: 'perm_key',
  admin_roles: 'slug',
  system_settings: 'setting_key',
  user_scopes: 'user_id, organisation_id',
  visitor_contact_details: 'visitor_id',
};

export function resolveDbDriver() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres';
  if (String(process.env.DB_DRIVER || '').toLowerCase() === 'postgres') return 'postgres';
  return 'mysql';
}

export function isPostgresDriver(driver = resolveDbDriver()) {
  return driver === 'postgres';
}

function adaptInsertIgnore(sql) {
  if (!/\bINSERT\s+IGNORE\b/i.test(sql)) return sql;
  const cleaned = sql.replace(/\bINSERT\s+IGNORE\b/i, 'INSERT').trim().replace(/;+\s*$/, '');
  return `${cleaned} ON CONFLICT DO NOTHING`;
}

function adaptOnDuplicateKeyUpdate(sql) {
  if (!/\bON DUPLICATE KEY UPDATE\b/i.test(sql)) return sql;

  const parts = sql.split(/\bON DUPLICATE KEY UPDATE\b/i);
  if (parts.length !== 2) return sql;

  const insertPart = parts[0].trim();
  const updatePart = parts[1].trim().replace(/;+\s*$/, '');
  const tableMatch = insertPart.match(/INSERT\s+INTO\s+(\w+)/i);
  const table = tableMatch?.[1];
  const conflict = UPSERT_CONFLICT[table];

  if (!conflict) {
    throw new Error(`PostgreSQL upsert mapping missing for table "${table}".`);
  }

  const pgUpdates = updatePart.replace(/VALUES\(([^)]+)\)/gi, 'EXCLUDED.$1');
  return `${insertPart} ON CONFLICT (${conflict}) DO UPDATE SET ${pgUpdates}`;
}

function adaptInformationSchema(sql) {
  return sql
    .replace(/information_schema\.COLUMNS/gi, 'information_schema.columns')
    .replace(/TABLE_SCHEMA\s*=\s*DATABASE\(\)/gi, "table_schema = 'public'")
    .replace(/\bTABLE_NAME\b/g, 'table_name')
    .replace(/\bCOLUMN_NAME\b/g, 'column_name');
}

export function prepareCreateTable(sql) {
  if (!/\bCREATE\s+TABLE\b/i.test(sql)) {
    return { ddl: null, indexes: [] };
  }

  const tableMatch = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
  const tableName = tableMatch?.[1];
  if (!tableName) return { ddl: sql, indexes: [] };

  const indexes = [];
  let ddl = sql;

  ddl = ddl.replace(/,?\s*INDEX\s+(\w+)\s+\(([^)]+)\)/gi, (_match, indexName, columns) => {
    indexes.push(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`);
    return '';
  });

  ddl = ddl.replace(/,?\s*UNIQUE\s+KEY\s+\w+\s+\(([^)]+)\)/gi, ', UNIQUE ($1)');
  ddl = ddl.replace(/,(\s*\))/g, '$1');

  return { ddl, indexes };
}

export function adaptSqlForPostgres(sql) {
  let text = String(sql || '');

  text = adaptInsertIgnore(text);
  text = adaptOnDuplicateKeyUpdate(text);
  text = adaptInformationSchema(text);

  text = text
    .replace(/GROUP_CONCAT\s*\(\s*DISTINCT\s+([^)]+)\)/gi, 'STRING_AGG(DISTINCT $1::text, \',\')')
    .replace(/\bDATE\s*\(([^)]+)\)/gi, '($1)::date')
    .replace(
      /\bDATE_SUB\s*\(\s*CURDATE\s*\(\s*\)\s*,\s*INTERVAL\s+WEEKDAY\s*\(\s*CURDATE\s*\(\s*\)\s*\)\s+DAY\s*\)/gi,
      "date_trunc('week', CURRENT_DATE)::date",
    )
    .replace(
      /\bDATE_ADD\s*\(\s*CURDATE\s*\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi,
      "(CURRENT_DATE + INTERVAL '$1 day')",
    )
    .replace(
      /\bDATE_SUB\s*\(\s*CURDATE\s*\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)\s+AND\s+created_at\s+<\s+CURDATE\s*\(\s*\)/gi,
      "CURRENT_DATE - INTERVAL '$1 day' AND created_at < CURRENT_DATE",
    )
    .replace(/\bDATE_SUB\s*\(\s*CURDATE\s*\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "CURRENT_DATE - INTERVAL '$1 day'")
    .replace(/\bHOUR\s*\(([^)]+)\)/gi, 'EXTRACT(HOUR FROM $1)')
    .replace(/\bCURDATE\(\)/gi, 'CURRENT_DATE')
    .replace(/\bDATABASE\s*\(\s*\)/gi, 'current_database()')
    .replace(/\bTINYINT\s*\(\s*1\s*\)/gi, 'SMALLINT')
    .replace(/\bDATETIME\b/gi, 'TIMESTAMP')
    .replace(/\s+ON UPDATE CURRENT_TIMESTAMP/gi, '');

  let index = 0;
  text = text.replace(/\?/g, () => `$${++index}`);

  return text;
}

export async function runPostgresQuery(client, sql, params = []) {
  const { ddl, indexes } = prepareCreateTable(sql);
  const statement = ddl || sql;
  const text = adaptSqlForPostgres(statement);
  const result = await client.query(text, params);

  for (const indexSql of indexes) {
    await client.query(indexSql);
  }

  return [result.rows, result.fields];
}
