import React, { useMemo, useRef, useState } from 'react';

const DEFAULT_PROCEDURE_TITLE = 'Процедура (не задано)';

const createRowId = (row, index) => {
    const code = String(row.code ?? '').trim();
    const name = String(row.name ?? '').trim();

    if (code || name) {
        return `${code}::${name}::${index}`;
    }

    return `row-${index}`;
};

const parseSheetRows = (rows) => {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()))
        .map((row, index) => {
            const code = String(row[0] ?? '').trim();
            const name = String(row[1] ?? '').trim();
            const qtyRaw = String(row[2] ?? '').trim();

            return {
                id: createRowId({ code, name }, index),
                code: code || `POS-${index + 1}`,
                name: name || 'Без названия',
                qty: qtyRaw || '1'
            };
        });
};

const parseUploadedSpecification = async (file) => {
    if (!file) {
        return [];
    }

    const content = await file.text();
    const rows = String(content || '')
        .split(/\r?\n/)
        .map((line) => {
            const semicolonCells = line.split(';');
            const commaCells = line.split(',');
            const tabCells = line.split('\t');

            if (tabCells.length >= semicolonCells.length && tabCells.length >= commaCells.length) {
                return tabCells;
            }

            return semicolonCells.length >= commaCells.length ? semicolonCells : commaCells;
        });

    return parseSheetRows(rows);
};

const CompactTable = ({ title, rows, selectedIds, onToggleRow }) => (
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

const AssemblyStagesWorkspace = () => {
    const fileInputRef = useRef(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [procedureName, setProcedureName] = useState('');
    const [place, setPlace] = useState('');
    const [normative, setNormative] = useState('');
    const [createdProcedures, setCreatedProcedures] = useState([]);
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
        const parsedRows = await parseUploadedSpecification(selectedFile);

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
                <button type="button" onClick={handleLoadSpecification}>Загрузить спецификацию</button>

                <button type="button" onClick={() => fileInputRef.current?.click()}>
                    Выбрать таблицу
                </button>

                <span className="assembly-stages-file-name">{selectedFile?.name || 'Файл не выбран'}</span>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
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
                    <label htmlFor="procedure-name">Введите название процедуры</label>
                    <input
                        id="procedure-name"
                        type="text"
                        value={procedureName}
                        onChange={(event) => setProcedureName(event.target.value)}
                        placeholder="Например: Сборка узла А"
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
                                    <th>№</th>
                                    <th>Процедура</th>
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
