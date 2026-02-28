import React, { useMemo, useRef, useState } from 'react';

const DEFAULT_PROCEDURE_TITLE = 'Процедура (не задано)';

const createRowId = (row, index) => {
    const code = String(row.code ?? '').trim();
    const name = String(row.name ?? '').trim();

    if (code || name) {
        return `${code}::${name}`;
    }

    return `row-${index}`;
};

const parseCsvRows = (text) => {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return [];
    }

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));

    const [header, ...dataRows] = rows;
    const headerLower = header.map((item) => item.toLowerCase());

    const codeIndex = headerLower.findIndex((value) => ['код', 'code', 'articul', 'артикул'].includes(value));
    const nameIndex = headerLower.findIndex((value) => ['наименование', 'name', 'название'].includes(value));
    const qtyIndex = headerLower.findIndex((value) => ['количество', 'qty', 'quantity', 'qty.'].includes(value));

    const firstRowLooksLikeHeader = codeIndex >= 0 || nameIndex >= 0 || qtyIndex >= 0;
    const sourceRows = firstRowLooksLikeHeader ? dataRows : rows;

    return sourceRows
        .map((row, index) => {
            const code = codeIndex >= 0 ? row[codeIndex] : row[0];
            const name = nameIndex >= 0 ? row[nameIndex] : row[1];
            const qtyRaw = qtyIndex >= 0 ? row[qtyIndex] : row[2];

            return {
                id: createRowId({ code, name }, index),
                code: code || `POS-${index + 1}`,
                name: name || 'Без названия',
                qty: qtyRaw || '1'
            };
        })
        .filter((row) => row.code || row.name);
};

const createDemoSpecification = () => {
    return Array.from({ length: 20 }, (_, index) => ({
        id: `demo-${index + 1}`,
        code: `DET-${String(index + 1).padStart(3, '0')}`,
        name: `Позиция спецификации ${index + 1}`,
        qty: String((index % 5) + 1)
    }));
};

const CompactTable = ({ title, rows, selectedIds, onToggleRow }) => {
    return (
        <div className="assembly-stages-table-card">
            <div className="assembly-stages-table-title">{title}</div>
            <div className="assembly-stages-table-scroll">
                <table className="assembly-stages-table">
                    <thead>
                        <tr>
                            <th className="assembly-stages-checkbox-col">✓</th>
                            <th>Код</th>
                            <th>Наименование</th>
                            <th>Кол-во</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="assembly-stages-empty-row">Нет данных</td>
                            </tr>
                        ) : (
                            rows.map((row) => (
                                <tr key={row.id}>
                                    <td className="assembly-stages-checkbox-col">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(row.id)}
                                            onChange={() => onToggleRow(row.id)}
                                        />
                                    </td>
                                    <td>{row.code}</td>
                                    <td>{row.name}</td>
                                    <td>{row.qty}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AssemblyStagesWorkspace = () => {
    const fileInputRef = useRef(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadMode, setUploadMode] = useState('file');
    const [procedureName, setProcedureName] = useState('');
    const [topRows, setTopRows] = useState([]);
    const [bottomRows, setBottomRows] = useState([]);
    const [selectedTopIds, setSelectedTopIds] = useState(new Set());
    const [selectedBottomIds, setSelectedBottomIds] = useState(new Set());

    const topTableTitle = useMemo(() => {
        const value = procedureName.trim();
        return value || DEFAULT_PROCEDURE_TITLE;
    }, [procedureName]);

    const onToggleTopRow = (id) => {
        setSelectedTopIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const onToggleBottomRow = (id) => {
        setSelectedBottomIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleLoadSpecification = async () => {
        if (!selectedFile) {
            setTopRows([]);
            setBottomRows(createDemoSpecification());
            setSelectedTopIds(new Set());
            setSelectedBottomIds(new Set());
            return;
        }

        const content = await selectedFile.text();
        const parsedRows = parseCsvRows(content);

        setTopRows([]);
        setBottomRows(parsedRows);
        setSelectedTopIds(new Set());
        setSelectedBottomIds(new Set());
    };

    const moveUp = () => {
        if (selectedBottomIds.size === 0) {
            return;
        }

        const rowsToMove = bottomRows.filter((row) => selectedBottomIds.has(row.id));
        const nextBottomRows = bottomRows.filter((row) => !selectedBottomIds.has(row.id));

        setTopRows((prev) => [...prev, ...rowsToMove]);
        setBottomRows(nextBottomRows);
        setSelectedBottomIds(new Set());
    };

    const moveDown = () => {
        if (selectedTopIds.size === 0) {
            return;
        }

        const rowsToMove = topRows.filter((row) => selectedTopIds.has(row.id));
        const nextTopRows = topRows.filter((row) => !selectedTopIds.has(row.id));

        setBottomRows((prev) => [...prev, ...rowsToMove]);
        setTopRows(nextTopRows);
        setSelectedTopIds(new Set());
    };

    return (
        <section className="assembly-stages-layout">
            <header className="assembly-stages-toolbar">
                <button type="button" onClick={handleLoadSpecification}>Загрузить спецификацию</button>

                <label className="assembly-stages-upload-mode">
                    Способ загрузки:
                    <select value={uploadMode} onChange={(event) => setUploadMode(event.target.value)}>
                        <option value="file">Файл</option>
                        <option value="manual" disabled>Ручной ввод (скоро)</option>
                    </select>
                </label>

                <button type="button" onClick={() => fileInputRef.current?.click()}>
                    Выбрать таблицу
                </button>

                <span className="assembly-stages-file-name">{selectedFile?.name || 'Файл не выбран'}</span>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                    style={{ display: 'none' }}
                />
            </header>

            <div className="assembly-stages-content-grid">
                <div className="assembly-stages-left-pane">
                    <CompactTable
                        title={topTableTitle}
                        rows={topRows}
                        selectedIds={selectedTopIds}
                        onToggleRow={onToggleTopRow}
                    />

                    <div className="assembly-stages-transfer-panel">
                        <button type="button" onClick={moveUp} disabled={selectedBottomIds.size === 0}>UP</button>
                        <button type="button" onClick={moveDown} disabled={selectedTopIds.size === 0}>Down</button>
                    </div>

                    <CompactTable
                        title="Спецификация"
                        rows={bottomRows}
                        selectedIds={selectedBottomIds}
                        onToggleRow={onToggleBottomRow}
                    />
                </div>

                <aside className="assembly-stages-right-pane">
                    <label htmlFor="procedure-name">Введите название процедуры:</label>
                    <input
                        id="procedure-name"
                        type="text"
                        value={procedureName}
                        onChange={(event) => setProcedureName(event.target.value)}
                        placeholder="Например: Сборка узла А"
                    />
                </aside>
            </div>
        </section>
    );
};

export default AssemblyStagesWorkspace;
