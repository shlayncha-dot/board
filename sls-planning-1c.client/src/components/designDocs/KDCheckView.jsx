import React from 'react';

const MIN_COLUMN_WIDTH = 48;
const VIRTUAL_ROW_HEIGHT = 40;
const VIRTUAL_OVERSCAN = 8;

const KDTableRow = React.memo(({
    row,
    tableColumns,
    isChecked,
    onToggleRow,
    selectedCell,
    onSelectCell
}) => (
    <tr className={isChecked ? 'kd-row-checked' : ''}>
        <td>
            <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleRow(row.id)}
            />
        </td>
        {tableColumns.map((column) => {
            const isSelectedCell = selectedCell?.rowId === row.id && selectedCell?.columnKey === column.key;

            return (
                <td
                    key={`${row.id}-${column.key}`}
                    className={isSelectedCell ? 'kd-cell-selected' : ''}
                    onClick={() => onSelectCell(row.id, column.key)}
                    title={String(row[column.key] ?? '')}
                >
                    {row[column.key]}
                </td>
            );
        })}
    </tr>
));

const KDCheckView = ({
    verifyInputRef,
    sortedRows,
    tableColumns,
    checkedRows,
    onToggleRow,
    allVisibleChecked,
    onToggleAllVisible,
    filterOptions,
    columnFilters,
    onSetFilter,
    columnWidths,
    onSetColumnWidth,
    onExcelUpload,
    searchValue,
    onSearchChange
}) => {
    const [openFilterKey, setOpenFilterKey] = React.useState(null);
    const [pendingFilters, setPendingFilters] = React.useState({});
    const [selectedCell, setSelectedCell] = React.useState(null);
    const resizeStateRef = React.useRef(null);
    const resizeRafRef = React.useRef(null);
    const filterPopoverRef = React.useRef(null);
    const [localColumnWidths, setLocalColumnWidths] = React.useState(columnWidths);
    const localColumnWidthsRef = React.useRef(columnWidths);
    const tableWrapRef = React.useRef(null);
    const [virtualState, setVirtualState] = React.useState({
        containerHeight: 400,
        scrollTop: 0
    });

    React.useEffect(() => {
        setLocalColumnWidths(columnWidths);
        localColumnWidthsRef.current = columnWidths;
    }, [columnWidths]);

    React.useEffect(() => {
        if (!selectedCell) {
            return;
        }

        const rowExists = sortedRows.some((row) => row.id === selectedCell.rowId);

        if (!rowExists) {
            setSelectedCell(null);
        }
    }, [selectedCell, sortedRows]);

    const handleSelectCell = React.useCallback((rowId, columnKey) => {
        setSelectedCell({ rowId, columnKey });
    }, []);

    React.useEffect(() => {
        const element = tableWrapRef.current;

        if (!element) {
            return undefined;
        }

        const updateContainerHeight = () => {
            setVirtualState((prevState) => {
                if (prevState.containerHeight === element.clientHeight) {
                    return prevState;
                }

                return {
                    ...prevState,
                    containerHeight: element.clientHeight
                };
            });
        };

        updateContainerHeight();

        const resizeObserver = new ResizeObserver(updateContainerHeight);
        resizeObserver.observe(element);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    const handleTableScroll = React.useCallback((event) => {
        const nextScrollTop = event.currentTarget.scrollTop;

        setVirtualState((prevState) => {
            if (prevState.scrollTop === nextScrollTop) {
                return prevState;
            }

            return {
                ...prevState,
                scrollTop: nextScrollTop
            };
        });
    }, []);

    const { topSpacerHeight, bottomSpacerHeight, visibleRows } = React.useMemo(() => {
        const totalRows = sortedRows.length;
        const visibleCount = Math.max(1, Math.ceil(virtualState.containerHeight / VIRTUAL_ROW_HEIGHT));
        const firstVisible = Math.max(0, Math.floor(virtualState.scrollTop / VIRTUAL_ROW_HEIGHT));
        const nextStartIndex = Math.max(0, firstVisible - VIRTUAL_OVERSCAN);
        const nextEndIndex = Math.min(totalRows, firstVisible + visibleCount + VIRTUAL_OVERSCAN);

        return {
            topSpacerHeight: nextStartIndex * VIRTUAL_ROW_HEIGHT,
            bottomSpacerHeight: Math.max(0, (totalRows - nextEndIndex) * VIRTUAL_ROW_HEIGHT),
            visibleRows: sortedRows.slice(nextStartIndex, nextEndIndex)
        };
    }, [sortedRows, virtualState.containerHeight, virtualState.scrollTop]);

    const tableBodyRows = React.useMemo(() => (
        visibleRows.map((row) => (
            <KDTableRow
                key={row.id}
                row={row}
                tableColumns={tableColumns}
                isChecked={Boolean(checkedRows[row.id])}
                onToggleRow={onToggleRow}
                selectedCell={selectedCell}
                onSelectCell={handleSelectCell}
            />
        ))
    ), [checkedRows, handleSelectCell, onToggleRow, selectedCell, tableColumns, visibleRows]);

    const closeFilterPopover = React.useCallback(() => {
        setOpenFilterKey(null);
        setPendingFilters({});
    }, []);

    React.useEffect(() => {
        if (!openFilterKey) {
            return undefined;
        }

        const onDocumentPointerDown = (event) => {
            const targetElement = event.target;

            if (targetElement instanceof Element && targetElement.closest('.filter-trigger')) {
                return;
            }

            if (!filterPopoverRef.current?.contains(targetElement)) {
                closeFilterPopover();
            }
        };

        document.addEventListener('mousedown', onDocumentPointerDown);

        return () => {
            document.removeEventListener('mousedown', onDocumentPointerDown);
        };
    }, [closeFilterPopover, openFilterKey]);

    const beginResize = (event, columnKey) => {
        event.preventDefault();
        event.stopPropagation();

        resizeStateRef.current = {
            columnKey,
            startX: event.clientX,
            startWidth: localColumnWidths[columnKey] || 160
        };

        const onMouseMove = (moveEvent) => {
            if (!resizeStateRef.current) {
                return;
            }

            const nextWidth = Math.max(MIN_COLUMN_WIDTH, resizeStateRef.current.startWidth + (moveEvent.clientX - resizeStateRef.current.startX));

            if (resizeRafRef.current) {
                return;
            }

            resizeRafRef.current = window.requestAnimationFrame(() => {
                const resizeState = resizeStateRef.current;

                if (!resizeState) {
                    resizeRafRef.current = null;
                    return;
                }

                setLocalColumnWidths((prevState) => {
                    const nextState = {
                        ...prevState,
                        [resizeState.columnKey]: nextWidth
                    };

                    localColumnWidthsRef.current = nextState;
                    return nextState;
                });
                resizeRafRef.current = null;
            });
        };

        const onMouseUp = () => {
            const resizeState = resizeStateRef.current;

            if (resizeState) {
                onSetColumnWidth(resizeState.columnKey, localColumnWidthsRef.current[resizeState.columnKey] || resizeState.startWidth);
            }

            resizeStateRef.current = null;

            if (resizeRafRef.current) {
                window.cancelAnimationFrame(resizeRafRef.current);
                resizeRafRef.current = null;
            }

            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const getPendingValues = (columnKey) => pendingFilters[columnKey] || [];

    const handleFilterToggle = (columnKey, value) => {
        const existingValues = getPendingValues(columnKey);
        const nextValues = existingValues.includes(value)
            ? existingValues.filter((item) => item !== value)
            : [...existingValues, value];

        setPendingFilters((prevState) => ({
            ...prevState,
            [columnKey]: nextValues
        }));
    };

    const handleFilterOpen = (columnKey) => {
        if (openFilterKey === columnKey) {
            closeFilterPopover();
            return;
        }

        setPendingFilters({
            [columnKey]: [...(columnFilters[columnKey] || [])]
        });
        setOpenFilterKey(columnKey);
    };

    const handleFilterSave = (columnKey) => {
        onSetFilter(columnKey, getPendingValues(columnKey));
        closeFilterPopover();
    };

    const handleFilterCancel = () => {
        closeFilterPopover();
    };

    const isColumnFiltered = (columnKey) => Boolean(columnFilters[columnKey]?.length);

    const tablePixelWidth = React.useMemo(() => {
        const allColumnsWidth = tableColumns.reduce((acc, column) => acc + (localColumnWidths[column.key] || 160), 44);
        return `${allColumnsWidth}px`;
    }, [localColumnWidths, tableColumns]);

    return (
        <section className="design-docs-page design-docs-check-page">
            <div className="check-toolbar">
                <button type="button" onClick={() => verifyInputRef.current?.click()}>📥 Загрузить Excel</button>
                <input
                    ref={verifyInputRef}
                    type="file"
                    accept=".xls,.xlsx"
                    className="hidden-input"
                    onChange={onExcelUpload}
                />
                <button type="button">✅ Верификация</button>
                <button type="button">🏷️ Нейминг</button>
                <button type="button">🧩 Общая проверка КД</button>
                <label className="kd-search-control">
                    <span>🔎 Поиск</span>
                    <input
                        type="text"
                        value={searchValue}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Введите текст"
                    />
                </label>
            </div>

            <div className="kd-table-wrap" ref={tableWrapRef} onScroll={handleTableScroll}>
                <table className="kd-table" style={{ width: tablePixelWidth, minWidth: '100%' }}>
                    <colgroup>
                        <col style={{ width: '44px' }} />
                        {tableColumns.map((column) => (
                            <col key={column.key} style={{ width: `${localColumnWidths[column.key] || 160}px` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="checkbox-column">
                                <input type="checkbox" checked={allVisibleChecked} onChange={onToggleAllVisible} />
                            </th>
                            {tableColumns.map((column) => (
                                <th key={column.key} className="sortable-column" style={{ width: `${localColumnWidths[column.key] || 160}px` }}>
                                    <div className="column-head-content">
                                        <span className="column-title">{column.label}</span>
                                        <button
                                            type="button"
                                            className={`filter-trigger ${isColumnFiltered(column.key) ? 'active' : ''}`}
                                            aria-label={`Фильтр столбца ${column.label}`}
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                            }}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                handleFilterOpen(column.key);
                                            }}
                                        >⏷</button>
                                    </div>
                                    {openFilterKey === column.key && (
                                        <div className="filter-popover" ref={filterPopoverRef} onClick={(event) => event.stopPropagation()}>
                                            <div className="filter-popover-content">
                                                <button type="button" onClick={() => setPendingFilters((prevState) => ({
                                                    ...prevState,
                                                    [column.key]: [...(filterOptions[column.key] || [])]
                                                }))}>
                                                    Выбрать все
                                                </button>
                                                <button type="button" onClick={() => setPendingFilters((prevState) => ({
                                                    ...prevState,
                                                    [column.key]: []
                                                }))}>
                                                    Сбросить
                                                </button>
                                                {(filterOptions[column.key] || []).map((value) => (
                                                    <label key={value}>
                                                        <input
                                                            type="checkbox"
                                                            checked={getPendingValues(column.key).includes(value)}
                                                            onChange={() => handleFilterToggle(column.key, value)}
                                                        />
                                                        {value}
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="filter-popover-actions">
                                                <button type="button" className="save-btn" onClick={() => handleFilterSave(column.key)}>Сохранить</button>
                                                <button type="button" className="cancel-btn" onClick={handleFilterCancel}>Отмена</button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="resize-handle" onMouseDown={(event) => beginResize(event, column.key)} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {topSpacerHeight > 0 && (
                            <tr className="kd-virtual-spacer" aria-hidden="true">
                                <td colSpan={tableColumns.length + 1} style={{ height: `${topSpacerHeight}px` }} />
                            </tr>
                        )}
                        {tableBodyRows}
                        {bottomSpacerHeight > 0 && (
                            <tr className="kd-virtual-spacer" aria-hidden="true">
                                <td colSpan={tableColumns.length + 1} style={{ height: `${bottomSpacerHeight}px` }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default React.memo(KDCheckView);
