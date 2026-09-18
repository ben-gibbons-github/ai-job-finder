import { CACHE_DB_FILE, getCacheDb } from './connection.js'

export interface CacheDatabaseSchemaTableOutline {
	name: string;
	tableType: string;
	columns: Array<{
		name: string;
		type: string;
		notNull: boolean;
		defaultValue: string;
		primaryKeyOrdinal: number;
	}>;
	keys: Array<{
		kind: 'primary' | 'unique' | 'index' | 'foreign';
		name: string;
		columns: string[];
		references: string;
	}>;
	rowCount: number | null;
}

export interface CacheDatabaseSchemaOutline {
	databaseFile: string;
	tables: CacheDatabaseSchemaTableOutline[];
}

export function getCacheDatabaseSchemaOutline(): CacheDatabaseSchemaOutline {
	const db = getCacheDb();
	const sqliteTables = db.prepare(`
		SELECT name, type
		FROM sqlite_master
		WHERE type IN ('table', 'view')
			AND name NOT LIKE 'sqlite_%'
		ORDER BY name ASC
	`).all() as Array<{ name?: string; type?: string }>;

	const tables = sqliteTables.map((table) => {
		const tableName = String(table.name ?? '').trim();
		const tableType = String(table.type ?? '').trim() || 'table';
		const quotedName = `"${tableName.replace(/"/g, '""')}"`;

		const tableInfoRows = db.prepare(`PRAGMA table_info(${quotedName})`).all() as Array<{
			name?: string;
			type?: string;
			notnull?: number;
			dflt_value?: string | null;
			pk?: number;
		}>;

		const columns = tableInfoRows.map((column) => ({
			name: String(column.name ?? ''),
			type: String(column.type ?? ''),
			notNull: Number(column.notnull ?? 0) === 1,
			defaultValue: column.dflt_value == null ? '' : String(column.dflt_value),
			primaryKeyOrdinal: Number(column.pk ?? 0),
		}));

		const keys: CacheDatabaseSchemaTableOutline['keys'] = [];
		const primaryColumns = columns
			.filter((column) => column.primaryKeyOrdinal > 0)
			.sort((left, right) => left.primaryKeyOrdinal - right.primaryKeyOrdinal)
			.map((column) => column.name);
		if (primaryColumns.length > 0) {
			keys.push({
				kind: 'primary',
				name: `pk_${tableName}`,
				columns: primaryColumns,
				references: '',
			});
		}

		const foreignKeyRows = db.prepare(`PRAGMA foreign_key_list(${quotedName})`).all() as Array<{
			id?: number;
			from?: string;
			to?: string;
			table?: string;
		}>;
		const foreignById = new Map<number, { table: string; mappings: Array<{ from: string; to: string }> }>();
		for (const row of foreignKeyRows) {
			const fkId = Number(row.id ?? 0);
			const entry = foreignById.get(fkId) ?? {
				table: String(row.table ?? ''),
				mappings: [],
			};
			entry.mappings.push({
				from: String(row.from ?? ''),
				to: String(row.to ?? ''),
			});
			foreignById.set(fkId, entry);
		}
		for (const [fkId, fk] of foreignById.entries()) {
			keys.push({
				kind: 'foreign',
				name: `fk_${tableName}_${fkId}`,
				columns: fk.mappings.map((mapping) => mapping.from),
				references: `${fk.table}(${fk.mappings.map((mapping) => mapping.to).join(', ')})`,
			});
		}

		const indexRows = db.prepare(`PRAGMA index_list(${quotedName})`).all() as Array<{
			name?: string;
			unique?: number;
		}>;
		for (const indexRow of indexRows) {
			const indexName = String(indexRow.name ?? '').trim();
			if (!indexName) {
				continue;
			}
			const quotedIndexName = `"${indexName.replace(/"/g, '""')}"`;
			const indexColumns = db.prepare(`PRAGMA index_info(${quotedIndexName})`).all() as Array<{ name?: string }>;
			const columnsForIndex = indexColumns
				.map((column) => String(column.name ?? '').trim())
				.filter(Boolean);

			keys.push({
				kind: Number(indexRow.unique ?? 0) === 1 ? 'unique' : 'index',
				name: indexName,
				columns: columnsForIndex,
				references: '',
			});
		}

		let rowCount: number | null = null;
		if (tableType === 'table') {
			try {
				const countRow = db.prepare(`SELECT COUNT(*) as c FROM ${quotedName}`).get() as { c?: number } | undefined;
				rowCount = Number(countRow?.c ?? 0);
			} catch {
				rowCount = null;
			}
		}

		return {
			name: tableName,
			tableType,
			columns,
			keys,
			rowCount,
		};
	});

	return {
		databaseFile: CACHE_DB_FILE,
		tables,
	};
}
