import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createAssemblyProcedure, getAssemblyProcedures } from '../services/assemblyStagesService';

const DEFAULT_PROCEDURE_TITLE = 'Процедура (не задано)';
const MIN_COLUMN_WIDTH = 36;

const formatNormativeTotalMinutes = (secondsTotal) => String(Math.ceil(secondsTotal / 60));

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

const findColumnIndex = (columns, variants) => columns.findIndex((column) => {
    const normalizedColumn = String(column || '').trim().toLowerCase();
    return variants.some((variant) => normalizedColumn === variant || normalizedColumn.startsWith(`${variant} `) || normalizedColumn.includes(variant));
});

const isAssemblyType = (rawTypeValue) => {
    const normalizedType = String(rawTypeValue || '').trim().toUpperCase();

    if (!normalizedType) {
        return false;
    }

    return ['СБ', 'СБОРКА', 'ПОДСБОРКА', 'СБОРОЧНАЯ ЕДИНИЦА'].includes(normalizedType) || normalizedType.startsWith('СБ ');
};

const isChildPoz = (parentPoz, candidatePoz) => {
    const parent = String(parentPoz || '').trim();
    const candidate = String(candidatePoz || '').trim();

    if (!parent || !candidate || parent === candidate || !candidate.startsWith(parent)) {
        return false;
    }

    const nextSymbol = candidate[parent.length];

    return ['.', '-', '/', '\\', ' '].includes(nextSymbol);
};

const getRowAndChildrenIds = (rows, sourceId, typeColumnIndex, pozColumnIndex) => {
    const row = rows.find((item) => item.id === sourceId);

    if (!row) {
        return [];
    }

    if (pozColumnIndex < 0) {
        return [sourceId];
    }

    const rowType = typeColumnIndex >= 0 ? row.values[typeColumnIndex] : '';
    const shouldExpandHierarchy = typeColumnIndex < 0 || isAssemblyType(rowType);

    if (!shouldExpandHierarchy) {
        return [sourceId];
    }

    const parentPoz = row.values[pozColumnIndex];
    const nestedIds = rows
        .filter((item) => isChildPoz(parentPoz, item.values[pozColumnIndex]))
        .map((item) => item.id);

    return [sourceId, ...nestedIds];
};

const buildSelectionUpdater = ({ rows, typeColumnIndex, pozColumnIndex, setSelectedIds }) => (id) => {
    setSelectedIds((prev) => {
        const next = new Set(prev);
        const affectedIds = getRowAndChildrenIds(rows, id, typeColumnIndex, pozColumnIndex);
        const shouldCheck = !next.has(id);

        affectedIds.forEach((affectedId) => {
            if (shouldCheck) {
                next.add(affectedId);
            } else {
                next.delete(affectedId);
            }
        });

        return next;
    });
};

const DataTable = ({
    title,
    columns,
    rows,
    selectedIds,
    onToggleRow,
    onToggleAll,
    emptyMessage,
    columnWidths,
    onSetColumnWidth
}) => {
    const resizeStateRef = useRef(null);
    const filterPopoverRef = useRef(null);
    const [openFilterIndex, setOpenFilterIndex] = useState(null);
    const [columnFilters, setColumnFilters] = useState({});
    const [pendingFilters, setPendingFilters] = useState({});

    const filterOptions = useMemo(() => columns.reduce((acc, _column, index) => {
        const options = [...new Set(rows.map((row) => String(row.values[index] || '').trim() || ''))]
            .sort((a, b) => a.localeCompare(b, 'ru'));
        acc[index] = options;
        return acc;
    }, {}), [columns, rows]);

    const filteredRows = useMemo(() => rows.filter((row) => Object.entries(columnFilters).every(([columnIndex, selectedValues]) => {
        if (!Array.isArray(selectedValues) || selectedValues.length === 0) {
            return true;
        }

        return selectedValues.includes(String(row.values[Number(columnIndex)] || '').trim() || '');
    })), [columnFilters, rows]);

    useEffect(() => {
        if (openFilterIndex === null) {
            return undefined;
        }

        const onMouseDown = (event) => {
            if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target)) {
                setOpenFilterIndex(null);
            }
        };

        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [openFilterIndex]);

    const handleResizeStart = (event, columnIndex) => {
        event.preventDefault();
        event.stopPropagation();

        resizeStateRef.current = {
            columnIndex,
            startX: event.clientX,
            startWidth: columnWidths[columnIndex] || 160
        };

        const onMouseMove = (moveEvent) => {
            if (!resizeStateRef.current) {
                return;
            }

            const nextWidth = Math.max(MIN_COLUMN_WIDTH, resizeStateRef.current.startWidth + (moveEvent.clientX - resizeStateRef.current.startX));
            onSetColumnWidth(resizeStateRef.current.columnIndex, nextWidth);
        };

        const onMouseUp = () => {
            resizeStateRef.current = null;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));

    const isColumnFiltered = (columnIndex) => Array.isArray(columnFilters[columnIndex])
        && columnFilters[columnIndex].length > 0
        && columnFilters[columnIndex].length < (filterOptions[columnIndex] || []).length;

    const openFilter = (columnIndex) => {
        setPendingFilters((prev) => ({
            ...prev,
            [columnIndex]: Array.isArray(columnFilters[columnIndex])
                ? [...columnFilters[columnIndex]]
                : [...(filterOptions[columnIndex] || [])]
        }));
        setOpenFilterIndex(columnIndex);
    };

    return (
        <div className="assembly-stages-table-card">
            <div className="assembly-stages-table-title">{title}</div>
            <div className="assembly-stages-table-scroll">
                <table className="assembly-stages-table">
                    <thead>
                        <tr>
                            <th className="assembly-stages-checkbox-col">
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={() => onToggleAll(filteredRows.map((row) => row.id))}
                                />
                            </th>
                            {columns.map((column, index) => (
                                <th key={`${column}-${index}`} style={{ width: `${columnWidths[index] || 160}px` }}>
                                    <div className="assembly-stages-th-content">
                                        <span>{column}</span>
                                        <button type="button" className={`filter-trigger ${isColumnFiltered(index) ? 'active' : ''}`} onClick={() => openFilter(index)}>⏷</button>
                                    </div>
                                    {openFilterIndex === index && (
                                        <div className="filter-popover" ref={filterPopoverRef} onClick={(event) => event.stopPropagation()}>
                                            <div className="filter-popover-content">
                                                <div className="filter-popover-top-actions">
                                                    <button type="button" onClick={() => setPendingFilters((prev) => ({ ...prev, [index]: [...(filterOptions[index] || [])] }))}>Выбрать все</button>
                                                    <button type="button" onClick={() => setPendingFilters((prev) => ({ ...prev, [index]: [] }))}>Сбросить</button>
                                                </div>
                                                {(filterOptions[index] || []).map((value) => (
                                                    <label key={`${index}-${value}`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={(pendingFilters[index] || []).includes(value)}
                                                            onChange={() => setPendingFilters((prev) => {
                                                                const nextValues = new Set(prev[index] || []);
                                                                if (nextValues.has(value)) {
                                                                    nextValues.delete(value);
                                                                } else {
                                                                    nextValues.add(value);
                                                                }

                                                                return {
                                                                    ...prev,
                                                                    [index]: [...nextValues]
                                                                };
                                                            })}
                                                        />
                                                        {value || 'Пусто'}
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="filter-popover-actions">
                                                <button type="button" className="save-btn" onClick={() => {
                                                    const allValues = filterOptions[index] || [];
                                                    const selectedValues = pendingFilters[index] || [];
                                                    setColumnFilters((prev) => ({
                                                        ...prev,
                                                        [index]: selectedValues.length === allValues.length ? [] : [...selectedValues]
                                                    }));
                                                    setOpenFilterIndex(null);
                                                }}>
                                                    Сохранить
                                                </button>
                                                <button type="button" className="cancel-btn" onClick={() => setOpenFilterIndex(null)}>Отмена</button>
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        className="assembly-stages-resize-handle"
                                        aria-label={`Изменить ширину столбца ${column}`}
                                        onMouseDown={(event) => handleResizeStart(event, index)}
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.length === 0 ? (
                            <tr>
                                <td colSpan={Math.max(columns.length + 1, 2)} className="assembly-stages-empty-row">{emptyMessage}</td>
                            </tr>
                        ) : (
                            filteredRows.map((row) => (
                                <tr key={row.id} className={selectedIds.has(row.id) ? 'assembly-stages-checked-row' : ''}>
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
};

const mapProcedureForView = (item) => ({
    id: item.id,
    name: item.procedureName,
    place: item.place,
    normative: item.normative,
    details: Array.isArray(item.details) ? item.details : []
});

const AssemblyStagesWorkspace = () => {
    const fileInputRef = useRef(null);

    const [procedureName, setProcedureName] = useState('');
    const [place, setPlace] = useState('');
    const [normative, setNormative] = useState('');
    const [createdProcedures, setCreatedProcedures] = useState([]);
    const [specificationName, setSpecificationName] = useState('');

    const [tableColumns, setTableColumns] = useState([]);
    const [topRows, setTopRows] = useState([]);
    const [bottomRows, setBottomRows] = useState([]);
    const [selectedTopIds, setSelectedTopIds] = useState(new Set());
    const [selectedBottomIds, setSelectedBottomIds] = useState(new Set());
    const [columnWidths, setColumnWidths] = useState({});
    const [bottomSearchValue, setBottomSearchValue] = useState('');
    const [isSavingProcedure, setIsSavingProcedure] = useState(false);

    const typeColumnIndex = useMemo(() => findColumnIndex(tableColumns, ['тип', 'type']), [tableColumns]);
    const pozColumnIndex = useMemo(() => findColumnIndex(tableColumns, ['поз', 'позиц']), [tableColumns]);

    const topTableTitle = useMemo(() => {
        const value = procedureName.trim();
        return value || DEFAULT_PROCEDURE_TITLE;
    }, [procedureName]);

    useEffect(() => {
        const selectedSpecificationName = specificationName.trim();

        if (!selectedSpecificationName) {
            setCreatedProcedures([]);
            return;
        }

        let ignore = false;

        getAssemblyProcedures(selectedSpecificationName)
            .then((procedures) => {
                if (ignore) {
                    return;
                }

                setCreatedProcedures(procedures.map(mapProcedureForView));
            })
            .catch(() => {
                if (!ignore) {
                    setCreatedProcedures([]);
                }
            });

        return () => {
            ignore = true;
        };
    }, [specificationName]);

    const normativeTotal = useMemo(() => createdProcedures.reduce((sum, item) => {
        const normalizedValue = item.normative.replace(/\s+/g, '').replace(',', '.');
        const parsedValue = Number(normalizedValue);

        if (Number.isFinite(parsedValue)) {
            return sum + parsedValue;
        }

        return sum;
    }, 0), [createdProcedures]);

    const onToggleTopRow = buildSelectionUpdater({ rows: topRows, typeColumnIndex, pozColumnIndex, setSelectedIds: setSelectedTopIds });
    const onToggleBottomRow = buildSelectionUpdater({ rows: bottomRows, typeColumnIndex, pozColumnIndex, setSelectedIds: setSelectedBottomIds });

    const setColumnWidth = (columnIndex, width) => {
        setColumnWidths((prev) => ({ ...prev, [columnIndex]: width }));
    };

    const onToggleAllTopRows = (visibleRowIds) => {
        if (visibleRowIds.length === 0) {
            return;
        }

        const allSelected = visibleRowIds.every((id) => selectedTopIds.has(id));
        setSelectedTopIds((prev) => {
            const next = new Set(prev);
            visibleRowIds.forEach((id) => {
                if (allSelected) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
            });
            return next;
        });
    };

    const onToggleAllBottomRows = (visibleRowIds) => {
        if (visibleRowIds.length === 0) {
            return;
        }

        const allSelected = visibleRowIds.every((id) => selectedBottomIds.has(id));
        setSelectedBottomIds((prev) => {
            const next = new Set(prev);
            visibleRowIds.forEach((id) => {
                if (allSelected) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
            });
            return next;
        });
    };

    const searchedBottomRows = useMemo(() => {
        const normalizedSearch = bottomSearchValue.trim().toLowerCase();

        if (!normalizedSearch) {
            return bottomRows;
        }

        return bottomRows.filter((row) => row.values.some((value) => String(value || '').toLowerCase().includes(normalizedSearch)));
    }, [bottomRows, bottomSearchValue]);

    const handleLoadSpecification = async (event) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        try {
            const parsedTable = await parseTableFromExcel(file);
            setSpecificationName(file.name);
            setTableColumns(parsedTable.columns);
            setTopRows([]);
            setBottomRows(parsedTable.rows);
            setSelectedTopIds(new Set());
            setSelectedBottomIds(new Set());
            setColumnWidths({});
            setBottomSearchValue('');
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


    const handleExportExcel = async () => {
        if (createdProcedures.length === 0) {
            alert('Нет созданных нарядов для выгрузки.');
            return;
        }

        try {
            const XLSX = await ensureSheetJs();
            const workbook = XLSX.utils.book_new();

            const ordersRows = [
                ['№', 'Название процедуры', 'Место', 'Норматив, с'],
                ...createdProcedures.map((item, index) => [index + 1, item.name, item.place, item.normative])
            ];

            XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(ordersRows), 'Список нарядов');

            createdProcedures.forEach((item, index) => {
                const detailsRows = [
                    [item.name || DEFAULT_PROCEDURE_TITLE],
                    ['Поз', 'Обозначение', 'Наименование', 'Количество'],
                    ...(item.details.length > 0
                        ? item.details.map((detail) => [detail.poz || '', detail.designation || '', detail.name || '', detail.quantity || ''])
                        : [['', '', 'Нет деталей', '']])
                ];

                const sheetName = String(index + 1).slice(0, 31);
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(detailsRows), sheetName);
            });

            const exportName = specificationName.trim() || 'assembly-stages';
            XLSX.writeFile(workbook, `${exportName}.xlsx`);
        } catch {
            alert('Не удалось создать Excel-файл.');
        }
    };

    const handleCreateProcedure = async () => {
        const preparedName = procedureName.trim();
        const preparedPlace = place.trim();
        const preparedNormative = normative.trim();
        const preparedSpecificationName = specificationName.trim();

        if (!preparedName || !preparedPlace || !preparedNormative || !preparedSpecificationName) {
            return;
        }

        if (topRows.length === 0) {
            alert('В верхней таблице нет деталей для сохранения процедуры.');
            return;
        }

        const pozIndex = findColumnIndex(tableColumns, ['поз']);
        const designationIndex = findColumnIndex(tableColumns, ['обозначение']);
        const nameIndex = findColumnIndex(tableColumns, ['наименование']);
        const quantityIndex = findColumnIndex(tableColumns, ['количество', 'кол-во']);

        const details = topRows.map((row) => ({
            poz: pozIndex >= 0 ? row.values[pozIndex] || '' : '',
            designation: designationIndex >= 0 ? row.values[designationIndex] || '' : '',
            name: nameIndex >= 0 ? row.values[nameIndex] || '' : '',
            quantity: quantityIndex >= 0 ? row.values[quantityIndex] || '' : ''
        }));

        try {
            setIsSavingProcedure(true);
            const saved = await createAssemblyProcedure({
                specificationName: preparedSpecificationName,
                procedureName: preparedName,
                place: preparedPlace,
                normative: preparedNormative,
                details
            });

            setCreatedProcedures((prev) => [...prev, mapProcedureForView(saved)]);
            setTopRows([]);
            setSelectedTopIds(new Set());
            setProcedureName('');
            setPlace('');
            setNormative('');
        } catch (error) {
            alert(error.message || 'Не удалось сохранить процедуру.');
        } finally {
            setIsSavingProcedure(false);
        }
    };

    return (
        <section className="assembly-stages-layout">
            <header className="assembly-stages-toolbar">
                <button type="button" className="assembly-stages-upload-btn" onClick={() => fileInputRef.current?.click()}>📥 Загрузить спецификацию</button>
                <button type="button" onClick={handleExportExcel}>📊 Создать Excel</button>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleLoadSpecification}
                    style={{ display: 'none' }}
                />
            </header>

            <div className="assembly-stages-main-scroll">
                <div className="assembly-stages-content-grid">
                    <div className="assembly-stages-left-pane">
                        <DataTable
                            title={topTableTitle}
                            columns={tableColumns}
                            rows={topRows}
                            selectedIds={selectedTopIds}
                            onToggleRow={onToggleTopRow}
                            onToggleAll={onToggleAllTopRows}
                            emptyMessage="Данные пока не выбраны"
                            columnWidths={columnWidths}
                            onSetColumnWidth={setColumnWidth}
                        />

                        <div className="assembly-stages-transfer-panel">
                            <button type="button" onClick={moveUp} disabled={selectedBottomIds.size === 0}>UP</button>
                            <button type="button" onClick={moveDown} disabled={selectedTopIds.size === 0}>Down</button>
                            <input
                                type="search"
                                value={bottomSearchValue}
                                onChange={(event) => setBottomSearchValue(event.target.value)}
                                className="assembly-stages-search"
                                placeholder="Поиск по нижней таблице"
                            />
                        </div>

                        <DataTable
                            title="Спецификация"
                            columns={tableColumns}
                            rows={searchedBottomRows}
                            selectedIds={selectedBottomIds}
                            onToggleRow={onToggleBottomRow}
                            onToggleAll={onToggleAllBottomRows}
                            emptyMessage="Спецификация не загружена"
                            columnWidths={columnWidths}
                            onSetColumnWidth={setColumnWidth}
                        />
                    </div>

                    <aside className="assembly-stages-right-pane">
                    <label htmlFor="specification-name">Название спецификации</label>
                    <input
                        id="specification-name"
                        type="text"
                        value={specificationName}
                        onChange={(event) => setSpecificationName(event.target.value)}
                    />

                    <label htmlFor="procedure-name">Введите название процедуры</label>
                    <input
                        id="procedure-name"
                        type="text"
                        value={procedureName}
                        onChange={(event) => setProcedureName(event.target.value)}
                    />

                    <div className="assembly-stages-inline-fields">
                        <label htmlFor="procedure-place">Место</label>
                        <input
                            id="procedure-place"
                            type="text"
                            value={place}
                            onChange={(event) => setPlace(event.target.value)}
                        />

                        <label htmlFor="procedure-normative">Норматив, с</label>
                        <input
                            id="procedure-normative"
                            type="text"
                            value={normative}
                            onChange={(event) => setNormative(event.target.value)}
                        />
                    </div>

                    <button type="button" onClick={handleCreateProcedure} disabled={isSavingProcedure} className="assembly-stages-create-btn">Создать</button>

                    <div className="assembly-stages-created-table-wrap">
                        <table className="assembly-stages-table">
                            <colgroup>
                                <col style={{ width: '48px' }} />
                                <col />
                                <col style={{ width: '80px' }} />
                                <col style={{ width: '108px' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>№</th>
                                    <th>Название процедуры</th>
                                    <th>Место</th>
                                    <th>Норматив, с</th>
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
                            <tfoot>
                                <tr>
                                    <td colSpan={3}>Общий норматив, мин</td>
                                    <td>{formatNormativeTotalMinutes(normativeTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    </aside>
                </div>
            </div>
        </section>
    );
};

export default AssemblyStagesWorkspace;
