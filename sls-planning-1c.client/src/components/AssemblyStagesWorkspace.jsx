import React, { useMemo, useRef, useState } from 'react';

const DEFAULT_PROCEDURE_TITLE = 'Процедура (не задано)';

const ensureSheetJs = () => {
    if (window.XLSX) {
        return Promise.resolve(window.XLSX);
    }

    return new Promise((resolve, reject) => {
        const existing = document.getElementById('sheetjs-cdn');

        if (existing) {
            existing.addEventListener('load', () => resolve(window.XLSX));
            existing.addEventListener('error', () => reject(new Error('Не удалось загрузить SheetJS.')));
            return;
        }

        const script = document.createElement('script');
        script.id = 'sheetjs-cdn';
        script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
        script.async = true;
        script.onload = () => resolve(window.XLSX);
        script.onerror = () => reject(new Error('Не удалось загрузить SheetJS.'));
        document.head.appendChild(script);
    });
};

const parseTableFromExcel = async (file) => {
    if (!file) {
        return { columns: [], rows: [] };
    }

    const XLSX = await ensureSheetJs();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = workbook.Sheets[firstSheetName];
    const sheetRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, blankrows: false, defval: '' });

    if (!sheetRows.length || !Array.isArray(sheetRows[0])) {
        return { columns: [], rows: [] };
    }

    const [headerRow, ...bodyRows] = sheetRows;
    const columns = headerRow.map((header, index) => String(header || `Столбец ${index + 1}`).trim() || `Столбец ${index + 1}`);

    const rows = bodyRows
        .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''))
        .map((row, rowIndex) => ({
            id: `row-${rowIndex}`,
            values: columns.map((_, columnIndex) => String(row[columnIndex] ?? '').trim())
        }));

    return { columns, rows };
};

const DataTable = ({ title, columns, rows, selectedIds, onToggleRow, emptyMessage }) => (
    <div className="assembly-stages-table-card">
        <div className="assembly-stages-table-title">{title}</div>
        <div className="assembly-stages-table-scroll">
            <table className="assembly-stages-table">
                <thead>
                    <tr>
                        <th className="assembly-stages-checkbox-col">✓</th>
                        {columns.map((column) => (
                            <th key={column}>{column}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={Math.max(columns.length + 1, 2)} className="assembly-stages-empty-row">{emptyMessage}</td>
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
                                {columns.map((column, index) => (
                                    <td key={`${row.id}-${column}`}>{row.values[index] || ''}</td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

const AssemblyStagesWorkspace = () => {
    const fileInputRef = useRef(null);

    const [procedureName, setProcedureName] = useState('');
    const [place, setPlace] = useState('');
    const [normative, setNormative] = useState('');
    const [createdProcedures, setCreatedProcedures] = useState([]);
    const [fileName, setFileName] = useState('Файл не выбран');

    const [tableColumns, setTableColumns] = useState([]);
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

    const handleLoadSpecification = async (event) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        try {
            const parsedTable = await parseTableFromExcel(file);

            setFileName(file.name);
            setTableColumns(parsedTable.columns);
            setTopRows([]);
            setBottomRows(parsedTable.rows);
            setSelectedTopIds(new Set());
            setSelectedBottomIds(new Set());
        } catch {
            alert('Не удалось прочитать Excel-файл. Проверьте формат .xls/.xlsx и повторите попытку.');
        } finally {
            event.target.value = '';
        }
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

    const handleCreateProcedure = () => {
        const preparedName = procedureName.trim();
        const preparedPlace = place.trim();
        const preparedNormative = normative.trim();

        if (!preparedName || !preparedPlace || !preparedNormative) {
            return;
        }

        setCreatedProcedures((prev) => [
            ...prev,
            {
                id: `procedure-${Date.now()}-${prev.length + 1}`,
                name: preparedName,
                place: preparedPlace,
                normative: preparedNormative
            }
        ]);

        setPlace('');
        setNormative('');
    };

    return (
        <section className="assembly-stages-layout">
            <header className="assembly-stages-toolbar">
                <button type="button" onClick={() => fileInputRef.current?.click()}>Загрузить спецификацию</button>
                <span className="assembly-stages-upload-mode">Алгоритм: Загрузить Excel файл</span>
                <span className="assembly-stages-file-name">{fileName}</span>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleLoadSpecification}
                    style={{ display: 'none' }}
                />
            </header>

            <div className="assembly-stages-content-grid">
                <div className="assembly-stages-left-pane">
                    <DataTable
                        title={topTableTitle}
                        columns={tableColumns}
                        rows={topRows}
                        selectedIds={selectedTopIds}
                        onToggleRow={onToggleTopRow}
                        emptyMessage="Данные пока не выбраны"
                    />

                    <div className="assembly-stages-transfer-panel">
                        <button type="button" onClick={moveUp} disabled={selectedBottomIds.size === 0}>UP</button>
                        <button type="button" onClick={moveDown} disabled={selectedTopIds.size === 0}>Down</button>
                    </div>

                    <DataTable
                        title="Спецификация"
                        columns={tableColumns}
                        rows={bottomRows}
                        selectedIds={selectedBottomIds}
                        onToggleRow={onToggleBottomRow}
                        emptyMessage="Спецификация не загружена"
                    />
                </div>

                <aside className="assembly-stages-right-pane">
                    <label htmlFor="procedure-name">Введите название процедуры</label>
                    <input
                        id="procedure-name"
                        type="text"
                        value={procedureName}
                        onChange={(event) => setProcedureName(event.target.value)}
                    />

                    <label htmlFor="procedure-place">Место</label>
                    <input
                        id="procedure-place"
                        type="text"
                        value={place}
                        onChange={(event) => setPlace(event.target.value)}
                    />

                    <label htmlFor="procedure-normative">Норматив</label>
                    <input
                        id="procedure-normative"
                        type="text"
                        value={normative}
                        onChange={(event) => setNormative(event.target.value)}
                    />

                    <button type="button" onClick={handleCreateProcedure} className="assembly-stages-create-btn">Создать</button>

                    <div className="assembly-stages-created-table-wrap">
                        <table className="assembly-stages-table">
                            <thead>
                                <tr>
                                    <th>Номер по порядку</th>
                                    <th>Название процедуры</th>
                                    <th>Место</th>
                                    <th>Норматив</th>
                                </tr>
                            </thead>
                            <tbody>
                                {createdProcedures.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="assembly-stages-empty-row">Нет созданных процедур</td>
                                    </tr>
                                ) : (
                                    createdProcedures.map((item, index) => (
                                        <tr key={item.id}>
                                            <td>{index + 1}</td>
                                            <td>{item.name}</td>
                                            <td>{item.place}</td>
                                            <td>{item.normative}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </aside>
            </div>
        </section>
    );
};

export default AssemblyStagesWorkspace;
