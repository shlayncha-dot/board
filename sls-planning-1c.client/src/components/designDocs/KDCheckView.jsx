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
    onSetColumnWidth
}) => {
    const [openFilterKey, setOpenFilterKey] = React.useState(null);
    const resizeStateRef = React.useRef(null);

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

    const handleFilterToggle = (columnKey, value) => {
        const existingValues = columnFilters[columnKey] || [];
        const nextValues = existingValues.includes(value)
            ? existingValues.filter((item) => item !== value)
            : [...existingValues, value];

        onSetFilter(columnKey, nextValues);
    };

    const isColumnFiltered = (columnKey) => Boolean(columnFilters[columnKey]?.length);

    return (
        <section className="design-docs-page design-docs-check-page">
            <div className="check-toolbar">
                <button type="button" onClick={() => verifyInputRef.current?.click()}>Загрузить Excel</button>
                <input ref={verifyInputRef} type="file" accept=".xls,.xlsx" className="hidden-input" />
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
                                                setOpenFilterKey((prevState) => (prevState === column.key ? null : column.key));
                                            }}
                                        >▾</button>
                                    </div>
                                    {openFilterKey === column.key && (
                                        <div className="filter-popover" onClick={(event) => event.stopPropagation()}>
                                            <button type="button" onClick={() => onSetFilter(column.key, filterOptions[column.key] || [])}>Выбрать все</button>
                                            <button type="button" onClick={() => onSetFilter(column.key, [])}>Сбросить</button>
                                            {(filterOptions[column.key] || []).map((value) => (
                                                <label key={value}>
                                                    <input
                                                        type="checkbox"
                                                        checked={(columnFilters[column.key] || []).includes(value)}
                                                        onChange={() => handleFilterToggle(column.key, value)}
                                                    />
                                                    {value}
                                                </label>
                                            ))}
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
                                <td>{row.code}</td>
                                <td>{row.name}</td>
                                <td>{row.material}</td>
                                <td>{row.qty}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default KDCheckView;
