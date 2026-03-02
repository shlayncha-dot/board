import React from 'react';

const MIN_COLUMN_WIDTH = 48;
const VIRTUAL_ROW_HEIGHT = 25;
const VIRTUAL_OVERSCAN = 8;

const formatMissingForCopy = (items) => (items.length ? items.map((item) => `- ${item}`).join('\n') : '—');

const KDTableRow = React.memo(({
    row,
    tableColumns,
    isChecked,
    onToggleRow,
    selectedCell,
    onSelectCell,
    namingIssuesByRowId,
    namingTargetColumnKey,
    verificationIssuesByRowId,
    designationTargetColumnKey
}) => (
    <tr className={`kd-data-row ${isChecked ? 'kd-row-checked' : ''}`.trim()}>
        <td>
            <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleRow(row.id)}
            />
        </td>
        {tableColumns.map((column) => {
            const isSelectedCell = selectedCell?.rowId === row.id && selectedCell?.columnKey === column.key;
            const isNamingIssueCell = namingTargetColumnKey === column.key && Boolean(namingIssuesByRowId[row.id]);
            const verificationIssue = verificationIssuesByRowId[row.id] || null;
            const isDxfIssueCell = designationTargetColumnKey === column.key && Boolean(verificationIssue?.dxf);
            const isPdfIssueCell = namingTargetColumnKey === column.key && Boolean(verificationIssue?.pdf);
            const verificationSeverity = isDxfIssueCell
                ? verificationIssue.dxf
                : (isPdfIssueCell ? verificationIssue.pdf : null);

            const cellClassName = [
                isSelectedCell ? 'kd-cell-selected' : '',
                isNamingIssueCell ? 'kd-cell-naming-issue' : '',
                verificationSeverity === 'missing' ? 'kd-cell-verification-missing' : '',
                verificationSeverity === 'duplicate' ? 'kd-cell-verification-duplicate' : ''
            ].filter(Boolean).join(' ');

            return (
                <td
                    key={`${row.id}-${column.key}`}
                    className={cellClassName}
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
    onSearchChange,
    onRunVerification,
    verificationInProgress,
    onRunNamingCheck,
    namingCheckInProgress,
    onRunGeneralCheck,
    generalCheckInProgress,
    namingIssuesByRowId,
    namingTargetColumnKey,
    namingReport,
    namingLogs,
    isNamingLogOpen,
    onCloseNamingLog,
    verificationIssuesByRowId,
    verificationReport,
    onCloseVerificationReport,
    generalCheckReport,
    onCloseGeneralCheckReport,
    designationTargetColumnKey
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
                namingIssuesByRowId={namingIssuesByRowId}
                namingTargetColumnKey={namingTargetColumnKey}
                verificationIssuesByRowId={verificationIssuesByRowId}
                designationTargetColumnKey={designationTargetColumnKey}
            />
        ))
    ), [checkedRows, designationTargetColumnKey, handleSelectCell, namingIssuesByRowId, namingTargetColumnKey, onToggleRow, selectedCell, tableColumns, verificationIssuesByRowId, visibleRows]);

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

    const copyVerificationReport = React.useCallback(async () => {
        if (!verificationReport) {
            return;
        }

        const lines = [];

        if (verificationReport.isSuccess) {
            lines.push('Все файлы DXF и PDF найдены');
        } else {
            lines.push('Не найдены следующие файлы:');
            lines.push('DXF:');
            lines.push(formatMissingForCopy(verificationReport.missingByBlock.DXF || []));
            lines.push('');
            lines.push('PDF:');
            lines.push(formatMissingForCopy(verificationReport.missingByBlock.PDF || []));

            if (verificationReport.duplicates.length) {
                lines.push('');
                lines.push('Файлы которые повторяются:');
                verificationReport.duplicates.forEach((duplicate) => {
                    lines.push(`Имя детали: ${duplicate.detailName}`);
                    lines.push((duplicate.paths || []).length ? duplicate.paths.join('\n') : 'путь не найден');
                    lines.push('');
                });
            }
        }

        await navigator.clipboard.writeText(lines.join('\n'));
    }, [verificationReport]);

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
                <button type="button" onClick={onRunVerification} disabled={verificationInProgress}>✅ {verificationInProgress ? 'Верификация...' : 'Верификация'}</button>
                <button type="button" onClick={onRunNamingCheck} disabled={namingCheckInProgress}>🏷️ {namingCheckInProgress ? 'Проверка...' : 'Нейминг'}</button>
                <button type="button" onClick={onRunGeneralCheck} disabled={generalCheckInProgress || verificationInProgress || namingCheckInProgress}>🧩 {generalCheckInProgress ? 'Проверка...' : 'Общая проверка КД'}</button>
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

            {namingReport && (
                <div className={`naming-report ${namingReport.isSuccess ? 'success' : 'error'}`}>
                    {namingReport.message}
                </div>
            )}

            {isNamingLogOpen && (
                <div className="verification-report-overlay" role="dialog" aria-modal="true">
                    <div className="verification-report-modal naming-log-modal">
                        <div className="verification-report-header">
                            <h3>Логи проверки Нейминг</h3>
                            <div className="verification-report-actions">
                                <button type="button" onClick={onCloseNamingLog}>Закрыть</button>
                            </div>
                        </div>
                        <div className="verification-report-body">
                            {(namingLogs || []).length ? (
                                <ol className="naming-log-list">
                                    {namingLogs.map((entry, index) => (
                                        <li key={`${entry}-${index}`}>{entry}</li>
                                    ))}
                                </ol>
                            ) : (
                                <p>Логи пока отсутствуют.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {verificationReport && (
                <div className="verification-report-overlay" role="dialog" aria-modal="true">
                    <div className="verification-report-modal">
                        <div className="verification-report-header">
                            <h3>Результат верификации</h3>
                            <div className="verification-report-actions">
                                <button type="button" onClick={copyVerificationReport}>Скопировать</button>
                                <button type="button" onClick={onCloseVerificationReport}>Закрыть</button>
                            </div>
                        </div>
                        <div className="verification-report-body">
                            {verificationReport.isSuccess ? (
                                <p>Все файлы DXF и PDF найдены</p>
                            ) : (
                                <>
                                    <p>Не найдены следующие файлы:</p>
                                    <table className="verification-report-table">
                                        <thead>
                                            <tr>
                                                <th>DXF файлы</th>
                                                <th>PDF файлы</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>
                                                    {(verificationReport.missingByBlock.DXF || []).length
                                                        ? (
                                                            <ul className="verification-missing-list">
                                                                {verificationReport.missingByBlock.DXF.map((item) => (
                                                                    <li key={`missing-dxf-${item}`}>{item}</li>
                                                                ))}
                                                            </ul>
                                                        )
                                                        : '—'}
                                                </td>
                                                <td>
                                                    {(verificationReport.missingByBlock.PDF || []).length
                                                        ? (
                                                            <ul className="verification-missing-list">
                                                                {verificationReport.missingByBlock.PDF.map((item) => (
                                                                    <li key={`missing-pdf-${item}`}>{item}</li>
                                                                ))}
                                                            </ul>
                                                        )
                                                        : '—'}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {verificationReport.duplicates.length > 0 && (
                                        <>
                                            <p><strong>Файлы которые повторяются:</strong></p>
                                            <ul className="verification-duplicates-list">
                                                {verificationReport.duplicates.map((duplicate) => (
                                                    <li key={`${duplicate.blockName}-${duplicate.detailName}`}>
                                                        <p><strong>Имя детали:</strong> {duplicate.detailName}</p>
                                                        <p>
                                                            {(duplicate.paths || []).length
                                                                ? duplicate.paths.map((path, index) => (
                                                                    <React.Fragment key={`${duplicate.blockName}-${duplicate.detailName}-${path}`}>
                                                                        {index > 0 && <br />}
                                                                        {path}
                                                                    </React.Fragment>
                                                                ))
                                                                : 'путь не найден'}
                                                        </p>
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {generalCheckReport && (
                <div className="verification-report-overlay" role="dialog" aria-modal="true">
                    <div className="verification-report-modal general-check-report-modal">
                        <div className="verification-report-header">
                            <h3>Результат общей проверки КД</h3>
                            <div className="verification-report-actions">
                                <button type="button" onClick={onCloseGeneralCheckReport}>Закрыть</button>
                            </div>
                        </div>
                        <div className="verification-report-body">
                            {generalCheckReport.isSuccess ? (
                                <p className="general-check-success">Проверка прошла успешно</p>
                            ) : (
                                <div className="general-check-blocks">
                                    {generalCheckReport.blocks.map((block) => (
                                        <div key={block.type} className="general-check-block">
                                            <p className="general-check-block-title"><strong>{block.type}</strong></p>
                                            <ul>
                                                {block.items.map((item) => (
                                                    <li key={`${block.type}-${item}`}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
