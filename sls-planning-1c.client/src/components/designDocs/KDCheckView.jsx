import React from 'react';

const KDCheckView = ({
    verifyInputRef,
    sortedRows,
    tableColumns,
    sortState,
    onToggleSort,
    checkedRows,
    onToggleRow,
    allVisibleChecked,
    onToggleAllVisible,
    filterOptions,
    columnFilters,
    onSetFilter,
    columnWidths,
    onSetColumnWidth,
    onExcelUpload
}) => {
    const [openFilterKey, setOpenFilterKey] = React.useState(null);
    const [pendingFilters, setPendingFilters] = React.useState({});
    const resizeStateRef = React.useRef(null);
    const filterPopoverRef = React.useRef(null);

    const closeFilterPopover = React.useCallback(() => {
        setOpenFilterKey(null);
        setPendingFilters({});
    }, []);

    React.useEffect(() => {
        if (!openFilterKey) {
            return undefined;
        }

        const onDocumentPointerDown = (event) => {
            if (!filterPopoverRef.current?.contains(event.target)) {
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
            startWidth: columnWidths[columnKey] || 160
        };

        const onMouseMove = (moveEvent) => {
            if (!resizeStateRef.current) {
                return;
            }

            const nextWidth = Math.max(80, resizeStateRef.current.startWidth + (moveEvent.clientX - resizeStateRef.current.startX));
            onSetColumnWidth(resizeStateRef.current.columnKey, nextWidth);
        };

        const onMouseUp = () => {
            resizeStateRef.current = null;
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

    return (
        <section className="design-docs-page design-docs-check-page">
            <div className="check-toolbar">
                <button type="button" onClick={() => verifyInputRef.current?.click()}>Загрузить Excel</button>
                <input
                    ref={verifyInputRef}
                    type="file"
                    accept=".xls,.xlsx"
                    className="hidden-input"
                    onChange={onExcelUpload}
                />
                <button type="button">Верификация</button>
                <button type="button">Нейминг</button>
                <button type="button">Общая проверка КД</button>
            </div>

            <div className="kd-table-wrap">
                <table className="kd-table">
                    <colgroup>
                        <col style={{ width: '44px' }} />
                        {tableColumns.map((column) => (
                            <col key={column.key} style={{ width: `${columnWidths[column.key] || 160}px` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="checkbox-column">
                                <input type="checkbox" checked={allVisibleChecked} onChange={onToggleAllVisible} />
                            </th>
                            {tableColumns.map((column) => (
                                <th key={column.key} className="sortable-column" style={{ width: `${columnWidths[column.key] || 160}px` }}>
                                    <div className="column-head-content" onClick={() => onToggleSort(column.key)}>
                                        {column.label}
                                        <span className="sort-indicator">
                                            {sortState.key === column.key ? (sortState.direction === 'asc' ? '▲' : '▼') : '↕'}
                                        </span>
                                        <button
                                            type="button"
                                            className={`filter-trigger ${isColumnFiltered(column.key) ? 'active' : ''}`}
                                            aria-label={`Фильтр столбца ${column.label}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleFilterOpen(column.key);
                                            }}
                                        >▾</button>
                                    </div>
                                    {openFilterKey === column.key && (
                                        <div className="filter-popover" ref={filterPopoverRef} onClick={(event) => event.stopPropagation()}>
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
                        {sortedRows.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(checkedRows[row.id])}
                                        onChange={() => onToggleRow(row.id)}
                                    />
                                </td>
                                {tableColumns.map((column) => (
                                    <td key={`${row.id}-${column.key}`}>{row[column.key]}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default KDCheckView;
