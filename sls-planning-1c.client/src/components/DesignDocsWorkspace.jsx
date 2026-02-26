import React, { useCallback, useMemo, useRef, useState } from 'react';
import SpecificationUploadView from './designDocs/SpecificationUploadView';
import KDCheckView from './designDocs/KDCheckView';
import DesignDocsSettingsView from './designDocs/DesignDocsSettingsView';

const sampleSpecs = [
    { id: 1, code: 'A-1001', name: 'Корпус', material: 'Сталь', qty: 2 },
    { id: 2, code: 'A-1002', name: 'Крышка', material: 'Алюминий', qty: 1 },
    { id: 3, code: 'A-1003', name: 'Пластина', material: 'Нержавеющая сталь', qty: 4 },
    { id: 4, code: 'A-1004', name: 'Кронштейн', material: 'Сталь', qty: 3 },
    { id: 5, code: 'A-1005', name: 'Втулка', material: 'Латунь', qty: 6 }
];

const defaultTableColumns = [
    { key: 'code', label: 'Код детали' },
    { key: 'name', label: 'Наименование' },
    { key: 'material', label: 'Материал' },
    { key: 'qty', label: 'Количество' }
];

const defaultColumnWidths = {
    code: 170,
    name: 280,
    material: 220,
    qty: 140
};

const createVerificationParams = () => [
    { type: 1, description: '', condition: '' },
    { type: 2, description: '', condition: '' },
    { type: 3, description: '', condition: '' },
    { type: 4, description: '', condition: '' },
    { type: 5, description: '', condition: '' }
];

const getColumnKey = (header, index) => {
    const normalized = String(header || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_]/gu, '');

    return normalized ? `${normalized}_${index}` : `column_${index}`;
};

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

const DesignDocsWorkspace = ({ activeSubItem }) => {
    const uploadInputRef = useRef(null);
    const verifyInputRef = useRef(null);
    const pdfFolderInputRef = useRef(null);

    const [productName, setProductName] = useState('');
    const [specName, setSpecName] = useState('');
    const [uploadFile, setUploadFile] = useState('');
    const [pdfPath, setPdfPath] = useState('C:/SLS/KD/PDF_DXF');
    const [savedPdfPath, setSavedPdfPath] = useState('C:/SLS/KD/PDF_DXF');
    const [verificationParams, setVerificationParams] = useState(createVerificationParams);
    const [savedVerificationParams, setSavedVerificationParams] = useState(createVerificationParams);

    const [tableColumns, setTableColumns] = useState(defaultTableColumns);
    const [tableRows, setTableRows] = useState(sampleSpecs);
    const [sortState, setSortState] = useState({ key: 'code', direction: 'asc' });
    const [checkedRows, setCheckedRows] = useState({});
    const [columnFilters, setColumnFilters] = useState({});
    const [columnWidths, setColumnWidths] = useState(defaultColumnWidths);

    const filteredRows = useMemo(() => {
        return tableRows.filter((row) => tableColumns.every((column) => {
            const selectedValues = columnFilters[column.key];

            if (!selectedValues || selectedValues.length === 0) {
                return true;
            }

            return selectedValues.includes(String(row[column.key] ?? ''));
        }));
    }, [tableRows, tableColumns, columnFilters]);

    const sortedRows = useMemo(() => {
        const rows = [...filteredRows];
        const { key, direction } = sortState;

        if (!key || !tableColumns.some((column) => column.key === key)) {
            return rows;
        }

        const directionFactor = direction === 'asc' ? 1 : -1;

        rows.sort((firstRow, secondRow) => {
            const firstValue = String(firstRow[key] ?? '');
            const secondValue = String(secondRow[key] ?? '');

            if (firstValue === secondValue) {
                return 0;
            }

            return firstValue.localeCompare(secondValue, 'ru', { numeric: true }) * directionFactor;
        });

        return rows;
    }, [filteredRows, sortState, tableColumns]);

    const filterOptions = useMemo(() => {
        const options = {};

        tableColumns.forEach((column) => {
            options[column.key] = [...new Set(tableRows.map((row) => String(row[column.key] ?? '')))];
        });

        return options;
    }, [tableColumns, tableRows]);

    const visibleRowIds = sortedRows.map((row) => row.id);
    const allVisibleChecked = visibleRowIds.length > 0 && visibleRowIds.every((id) => checkedRows[id]);

    const toggleSort = useCallback((key) => {
        setSortState((prevState) => {
            if (prevState.key === key) {
                return {
                    key,
                    direction: prevState.direction === 'asc' ? 'desc' : 'asc'
                };
            }

            return { key, direction: 'asc' };
        });
    }, []);

    const toggleRow = useCallback((rowId) => {
        setCheckedRows((prevState) => ({
            ...prevState,
            [rowId]: !prevState[rowId]
        }));
    }, []);

    const toggleAllVisible = useCallback(() => {
        setCheckedRows((prevState) => {
            if (allVisibleChecked) {
                return {};
            }

            const nextState = { ...prevState };

            visibleRowIds.forEach((rowId) => {
                nextState[rowId] = true;
            });

            return nextState;
        });
    }, [allVisibleChecked, visibleRowIds]);

    const setFilter = useCallback((columnKey, values) => {
        setColumnFilters((prevState) => {
            if (values.length === 0) {
                const nextState = { ...prevState };
                delete nextState[columnKey];
                return nextState;
            }

            return {
                ...prevState,
                [columnKey]: values
            };
        });
    }, []);

    const setColumnWidth = useCallback((columnKey, width) => {
        setColumnWidths((prevState) => ({
            ...prevState,
            [columnKey]: width
        }));
    }, []);

    const applyExcelData = (sheetRows) => {
        const [headerRow, ...bodyRows] = sheetRows;
        const parsedColumns = headerRow.map((header, index) => ({
            key: getColumnKey(header, index),
            label: String(header || `Столбец ${index + 1}`).trim() || `Столбец ${index + 1}`
        }));

        const parsedRows = bodyRows
            .filter((row) => row.some((cell) => String(cell || '').trim() !== ''))
            .map((row, rowIndex) => {
                const rowData = { id: rowIndex + 1 };

                parsedColumns.forEach((column, columnIndex) => {
                    rowData[column.key] = String(row[columnIndex] ?? '').trim();
                });

                return rowData;
            });

        const nextWidths = parsedColumns.reduce((acc, column) => {
            acc[column.key] = 220;
            return acc;
        }, {});

        setTableColumns(parsedColumns);
        setTableRows(parsedRows);
        setSortState({ key: parsedColumns[0]?.key || '', direction: 'asc' });
        setCheckedRows({});
        setColumnFilters({});
        setColumnWidths(nextWidths);
    };

    const handleExcelUpload = async (event) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        try {
            const XLSX = await ensureSheetJs();
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const firstSheet = workbook.Sheets[firstSheetName];
            const sheetRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, blankrows: false, defval: '' });

            if (!sheetRows.length || sheetRows[0].length === 0) {
                return;
            }

            applyExcelData(sheetRows);
        } catch {
            alert('Не удалось прочитать Excel-файл. Проверьте формат .xls/.xlsx и повторите попытку.');
        } finally {
            event.target.value = '';
        }
    };

    const handleBrowsePdfFolder = async () => {
        pdfFolderInputRef.current?.click();
    };

    const handlePdfFolderFallback = (event) => {
        const file = event.target.files?.[0];
        const relativePath = file?.webkitRelativePath || '';
        const selectedFolderName = relativePath.split('/')[0] || '';

        const absoluteFilePath = typeof file?.path === 'string' ? file.path.replace(/\\/g, '/') : '';
        const relativeFilePath = relativePath ? `/${relativePath}` : '';
        const fullPathFromFile = absoluteFilePath && relativeFilePath && absoluteFilePath.endsWith(relativeFilePath)
            ? absoluteFilePath.slice(0, absoluteFilePath.length - relativeFilePath.length)
            : '';

        const inputValuePath = event.target.value
            ? event.target.value.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
            : '';
        const fallbackPath = inputValuePath && selectedFolderName ? `${inputValuePath}/${selectedFolderName}` : '';
        const nextPath = fullPathFromFile || fallbackPath || selectedFolderName;

        if (nextPath) {
            setPdfPath(nextPath);
        }

        event.target.value = '';
    };

    const handleVerificationParamChange = (index, field, value) => {
        setVerificationParams((prevState) => prevState.map((row, rowIndex) => (
            rowIndex === index
                ? { ...row, [field]: value }
                : row
        )));
    };

    const handleSavePdfPath = () => {
        setSavedPdfPath(pdfPath);
        setSavedVerificationParams(verificationParams.map((row) => ({ ...row })));
    };

    const handleCancelPdfPath = () => {
        setPdfPath(savedPdfPath);
        setVerificationParams(savedVerificationParams.map((row) => ({ ...row })));
    };

    return (
        <>
            <div className={`design-docs-subview ${activeSubItem === 0 ? 'active' : ''}`}>
                <SpecificationUploadView
                    productName={productName}
                    onProductNameChange={setProductName}
                    specName={specName}
                    onSpecNameChange={setSpecName}
                    uploadFile={uploadFile}
                    uploadInputRef={uploadInputRef}
                    onUploadFileChange={setUploadFile}
                />
            </div>

            <div className={`design-docs-subview ${activeSubItem === 1 ? 'active' : ''}`}>
                <KDCheckView
                    verifyInputRef={verifyInputRef}
                    sortedRows={sortedRows}
                    tableColumns={tableColumns}
                    sortState={sortState}
                    onToggleSort={toggleSort}
                    checkedRows={checkedRows}
                    onToggleRow={toggleRow}
                    allVisibleChecked={allVisibleChecked}
                    onToggleAllVisible={toggleAllVisible}
                    filterOptions={filterOptions}
                    columnFilters={columnFilters}
                    onSetFilter={setFilter}
                    columnWidths={columnWidths}
                    onSetColumnWidth={setColumnWidth}
                    onExcelUpload={handleExcelUpload}
                />
            </div>

            <div className={`design-docs-subview ${activeSubItem !== 0 && activeSubItem !== 1 ? 'active' : ''}`}>
                <DesignDocsSettingsView
                    pdfPath={pdfPath}
                    onPdfPathChange={setPdfPath}
                    onBrowsePdfFolder={handleBrowsePdfFolder}
                    pdfFolderInputRef={pdfFolderInputRef}
                    onPdfFolderFallbackChange={handlePdfFolderFallback}
                    verificationParams={verificationParams}
                    onVerificationParamChange={handleVerificationParamChange}
                    onSave={handleSavePdfPath}
                    onCancel={handleCancelPdfPath}
                />
            </div>
        </>
    );
};

export default DesignDocsWorkspace;
