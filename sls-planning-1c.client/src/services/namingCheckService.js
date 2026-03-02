const ALLOWED_TYPES = new Set(['компл', 'крепеж', 'крепеж_св']);

const normalizeType = (value) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, '_')
    .replace(/[.,;:!?]+/g, '');

const normalizeAllowedType = (value) => normalizeType(value).replace(/-+/g, '_');

const normalizeColumnLabel = (value) => String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, '')
    .replace(/[.,;:!?"'`()\-_/\\]+/g, '');

const ALLOWED_TYPES_NORMALIZED = new Set(Array.from(ALLOWED_TYPES, normalizeAllowedType));

export const extractRowsForNamingCheck = (rows, tableColumns) => {
    const nameColumn = tableColumns.find((column) => normalizeColumnLabel(column.label).includes('наимен'));
    const typeColumn = tableColumns.find((column) => normalizeColumnLabel(column.label).includes('тип'));

    if (!nameColumn) {
        return {
            rows: [],
            nameColumnKey: null,
            errorMessage: 'Не найден столбец «Наименование». Проверьте заголовок в Excel.'
        };
    }

    if (!typeColumn) {
        return {
            rows: [],
            nameColumnKey: nameColumn.key,
            errorMessage: 'Не найден столбец «Тип». Проверьте заголовок в Excel.'
        };
    }

    const filteredRows = rows
        .map((row) => ({
            rowId: String(row.id),
            name: String(row[nameColumn.key] ?? '').trim(),
            type: normalizeType(row[typeColumn.key])
        }))
        .filter((row) => row.name && ALLOWED_TYPES_NORMALIZED.has(normalizeAllowedType(row.type)))
        .map(({ rowId, name }) => ({ rowId, name }));

    return {
        rows: filteredRows,
        nameColumnKey: nameColumn.key,
        errorMessage: null
    };
};
