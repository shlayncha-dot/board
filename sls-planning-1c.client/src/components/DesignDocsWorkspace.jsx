import React, { useCallback, useMemo, useRef, useState } from 'react';
import SpecificationUploadView from './designDocs/SpecificationUploadView';
import KDCheckView from './designDocs/KDCheckView';
import DesignDocsSettingsView from './designDocs/DesignDocsSettingsView';
import { verificationApi } from '../config/apiConfig';
import { extractRowsForNamingCheck } from '../services/namingCheckService';

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

const createSpecificationSettings = () => ({
    columns: '',
    type: '',
    coverage: '',
    primer: ''
});

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
    const [specificationSettings, setSpecificationSettings] = useState(createSpecificationSettings);
    const [savedSpecificationSettings, setSavedSpecificationSettings] = useState(createSpecificationSettings);

    const [tableColumns, setTableColumns] = useState(defaultTableColumns);
    const [tableRows, setTableRows] = useState(sampleSpecs);
    const [checkedRows, setCheckedRows] = useState({});
    const [columnFilters, setColumnFilters] = useState({});
    const [columnWidths, setColumnWidths] = useState(defaultColumnWidths);
    const [searchValue, setSearchValue] = useState('');
    const [verificationInProgress, setVerificationInProgress] = useState(false);
    const [verificationIssuesByRowId, setVerificationIssuesByRowId] = useState({});
    const [verificationReport, setVerificationReport] = useState(null);
    const [namingCheckInProgress, setNamingCheckInProgress] = useState(false);
    const [namingIssuesByRowId, setNamingIssuesByRowId] = useState({});
    const [namingReport, setNamingReport] = useState(null);

    const filteredRows = useMemo(() => {
        const normalizedSearch = searchValue.trim().toLowerCase();

        return tableRows.filter((row) => {
            const passedColumnFilters = tableColumns.every((column) => {
                const selectedValues = columnFilters[column.key];

                if (!selectedValues || selectedValues.length === 0) {
                    return true;
                }

                return selectedValues.includes(String(row[column.key] ?? ''));
            });

            if (!passedColumnFilters) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            return tableColumns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(normalizedSearch));
        });
    }, [columnFilters, searchValue, tableColumns, tableRows]);

    const sortedRows = useMemo(() => [...filteredRows], [filteredRows]);

    const filterOptions = useMemo(() => {
        const options = {};

        tableColumns.forEach((column) => {
            const normalizedSearch = searchValue.trim().toLowerCase();
            const availableValues = tableRows
                .filter((row) => {
                    const passedOtherColumnFilters = tableColumns.every((otherColumn) => {
                        if (otherColumn.key === column.key) {
                            return true;
                        }

                        const selectedValues = columnFilters[otherColumn.key];

                        if (!selectedValues || selectedValues.length === 0) {
                            return true;
                        }

                        return selectedValues.includes(String(row[otherColumn.key] ?? ''));
                    });

                    if (!passedOtherColumnFilters) {
                        return false;
                    }

                    if (!normalizedSearch) {
                        return true;
                    }

                    return tableColumns.some((searchColumn) => String(row[searchColumn.key] ?? '').toLowerCase().includes(normalizedSearch));
                })
                .map((row) => String(row[column.key] ?? ''));

            options[column.key] = Array.from(new Set(availableValues));
        });

        return options;
    }, [columnFilters, searchValue, tableColumns, tableRows]);

    const visibleRowIds = useMemo(() => sortedRows.map((row) => row.id), [sortedRows]);

    const allVisibleChecked = useMemo(() => {
        if (visibleRowIds.length === 0) {
            return false;
        }

        return visibleRowIds.every((id) => checkedRows[id]);
    }, [checkedRows, visibleRowIds]);

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

    const applyExcelData = useCallback((sheetRows) => {
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
        setCheckedRows({});
        setColumnFilters({});
        setColumnWidths(nextWidths);
        setSearchValue('');
        setVerificationIssuesByRowId({});
        setVerificationReport(null);
        setNamingIssuesByRowId({});
        setNamingReport(null);
    }, []);

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


    const runVerification = useCallback(async () => {
        setVerificationInProgress(true);

        try {
            const payload = {
                rows: sortedRows.map((row) => ({
                    rowId: String(row.id),
                    values: tableColumns.reduce((acc, column) => {
                        acc[column.label] = String(row[column.key] ?? '').trim();
                        return acc;
                    }, {})
                })),
                typeRules: verificationParams.map((rule) => ({
                    type: rule.type,
                    condition: rule.condition
                }))
            };

            const response = await fetch(verificationApi.kd, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Ошибка запроса к серверу верификации.');
            }

            const result = await response.json();
            const blocks = [result.dxf, result.pdf];
            const missingByBlock = {
                DXF: [],
                PDF: []
            };
            const duplicates = [];
            const issuesByRowId = {};

            blocks.forEach((block) => {
                block.issues.forEach((issue) => {
                    const normalizedBlockName = String(block.blockName || '').toUpperCase();
                    const issueSeverity = String(issue.severity || '').toLowerCase();

                    if (!issuesByRowId[issue.rowId]) {
                        issuesByRowId[issue.rowId] = {
                            dxf: null,
                            pdf: null
                        };
                    }

                    if (normalizedBlockName === 'DXF') {
                        issuesByRowId[issue.rowId].dxf = issueSeverity;
                    }

                    if (normalizedBlockName === 'PDF') {
                        issuesByRowId[issue.rowId].pdf = issueSeverity;
                    }

                    if (issueSeverity === 'missing') {
                        if (normalizedBlockName === 'DXF') {
                            missingByBlock.DXF.push(issue.detailName);
                        }

                        if (normalizedBlockName === 'PDF') {
                            missingByBlock.PDF.push(issue.detailName);
                        }
                    }

                    if (issueSeverity === 'duplicate') {
                        duplicates.push({
                            blockName: normalizedBlockName,
                            detailName: issue.detailName,
                            paths: issue.paths
                        });
                    }
                });
            });

            setVerificationIssuesByRowId(issuesByRowId);
            setVerificationReport({
                isSuccess: Object.keys(issuesByRowId).length === 0,
                missingByBlock,
                duplicates
            });
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Ошибка выполнения верификации.');
        } finally {
            setVerificationInProgress(false);
        }
    }, [sortedRows, tableColumns, verificationParams]);

    const runNamingCheck = useCallback(async () => {
        const { rows: namingRows, nameColumnKey, errorMessage } = extractRowsForNamingCheck(sortedRows, tableColumns);

        if (errorMessage) {
            alert(errorMessage);
            return;
        }

        if (!nameColumnKey) {
            alert('Не найден столбец «Наименование».');
            return;
        }

        if (!namingRows.length) {
            setNamingIssuesByRowId({});
            setNamingReport({
                isSuccess: true,
                message: 'Все названия соответствует базе 1С'
            });
            alert('Для проверки не найдено деталей с типами: Компл, Крепеж, Крепеж_св.');
            return;
        }

        setNamingCheckInProgress(true);

        try {
            const response = await fetch(verificationApi.naming, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ items: namingRows })
            });

            if (!response.ok) {
                throw new Error('Ошибка запроса к сервису Нейминг.');
            }

            const result = await response.json();
            const notFoundRows = result.results.filter((item) => !item.isFound);
            const notFoundMap = notFoundRows.reduce((acc, item) => {
                acc[item.rowId] = true;
                return acc;
            }, {});

            setNamingIssuesByRowId(notFoundMap);

            if (notFoundRows.length === 0) {
                const successMessage = 'Все названия соответствует базе 1С';
                setNamingReport({ isSuccess: true, message: successMessage });
                alert(successMessage);
                return;
            }

            const reportLines = notFoundRows.map((item) => `Строка ${item.rowId}: ${item.name} — ${item.status}`);
            const errorMessage = ['Найдены отсутствующие наименования в базе 1С:', ...reportLines].join('\n');

            setNamingReport({
                isSuccess: false,
                message: `Не найдено в базе 1С: ${notFoundRows.length}`
            });
            alert(errorMessage);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Ошибка выполнения проверки Нейминг.');
        } finally {
            setNamingCheckInProgress(false);
        }
    }, [sortedRows, tableColumns]);

    const namingTargetColumnKey = useMemo(() => {
        const nameColumn = tableColumns.find((column) => column.label.toLowerCase().includes('наимен'));
        return nameColumn?.key || null;
    }, [tableColumns]);

    const designationTargetColumnKey = useMemo(() => {
        const designationColumn = tableColumns.find((column) => column.label.toLowerCase().includes('обознач'));
        return designationColumn?.key || null;
    }, [tableColumns]);

    const handleVerificationParamChange = (index, field, value) => {
        setVerificationParams((prevState) => prevState.map((row, rowIndex) => (
            rowIndex === index
                ? { ...row, [field]: value }
                : row
        )));
    };

    const handleSpecificationSettingChange = (field, value) => {
        setSpecificationSettings((prevState) => ({
            ...prevState,
            [field]: value
        }));
    };

    const handleSavePdfPath = () => {
        setSavedPdfPath(pdfPath);
        setSavedVerificationParams(verificationParams.map((row) => ({ ...row })));
        setSavedSpecificationSettings({ ...specificationSettings });
    };

    const handleCancelPdfPath = () => {
        setPdfPath(savedPdfPath);
        setVerificationParams(savedVerificationParams.map((row) => ({ ...row })));
        setSpecificationSettings({ ...savedSpecificationSettings });
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
                    searchValue={searchValue}
                    onSearchChange={setSearchValue}
                    onRunVerification={runVerification}
                    verificationInProgress={verificationInProgress}
                    onRunNamingCheck={runNamingCheck}
                    namingCheckInProgress={namingCheckInProgress}
                    namingIssuesByRowId={namingIssuesByRowId}
                    namingTargetColumnKey={namingTargetColumnKey}
                    namingReport={namingReport}
                    verificationIssuesByRowId={verificationIssuesByRowId}
                    verificationReport={verificationReport}
                    onCloseVerificationReport={() => setVerificationReport(null)}
                    designationTargetColumnKey={designationTargetColumnKey}
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
                    specificationSettings={specificationSettings}
                    onSpecificationSettingChange={handleSpecificationSettingChange}
                    onSave={handleSavePdfPath}
                    onCancel={handleCancelPdfPath}
                />
            </div>
        </>
    );
};

export default DesignDocsWorkspace;
