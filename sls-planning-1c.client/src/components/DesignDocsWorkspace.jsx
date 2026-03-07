import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SpecificationUploadView from './designDocs/SpecificationUploadView';
import SpecificationListView from './designDocs/SpecificationListView';
import KDCheckView from './designDocs/KDCheckView';
import DesignDocsSettingsView from './designDocs/DesignDocsSettingsView';
import { fileIndexApi, specificationUploadApi, verificationApi } from '../config/apiConfig';
import { extractRowsForNamingCheck } from '../services/namingCheckService';

const sampleSpecs = [];

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

const normalizeVerificationParams = (typeRules) => {
    const defaults = createVerificationParams();

    if (!Array.isArray(typeRules) || typeRules.length === 0) {
        return defaults;
    }

    const byType = new Map(typeRules.map((rule) => [Number(rule.type), rule]));

    return defaults.map((item) => {
        const source = byType.get(item.type);

        if (!source) {
            return item;
        }

        return {
            type: item.type,
            description: String(source.description ?? ''),
            condition: String(source.condition ?? '')
        };
    });
};

const createSpecificationSettings = () => ({
    columns: '',
    type: '',
    coverage: '',
    primer: '',
    linkServer: ''
});

const normalizeSpecificationSettings = (specification) => {
    const defaults = createSpecificationSettings();

    if (!specification || typeof specification !== 'object') {
        return defaults;
    }

    return {
        columns: String(specification.columns ?? ''),
        type: String(specification.type ?? ''),
        coverage: String(specification.coverage ?? ''),
        primer: String(specification.primer ?? ''),
        linkServer: String(specification.linkServer ?? '')
    };
};

const normalizeVerificationSeverity = (severity) => {
    if (typeof severity === 'string') {
        const normalized = severity.toLowerCase();

        if (normalized === 'missing' || normalized === 'duplicate') {
            return normalized;
        }

        if (normalized === '0') {
            return 'missing';
        }

        if (normalized === '1') {
            return 'duplicate';
        }
    }

    if (severity === 0) {
        return 'missing';
    }

    if (severity === 1) {
        return 'duplicate';
    }

    return null;
};

const getColumnKey = (header, index) => {
    const normalized = String(header || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_]/gu, '');

    return normalized ? `${normalized}_${index}` : `column_${index}`;
};

const normalizeValue = (value) => String(value ?? '').trim();

const parseSettingsList = (rawValue, { splitByComma = true } = {}) => String(rawValue ?? '')
    .split(splitByComma ? /\r?\n|;|,/ : /\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeLabelForMatch = (label) => normalizeValue(label)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '');

const normalizeCellForCompare = (value) => normalizeValue(value).toLowerCase();


const preferredDesignationColumnLabels = [
    'Обозначение WD- Без чертежа (гибов)',
    'Обозначение'
];

const isTypeLabel = (label) => {
    const normalized = normalizeLabelForMatch(label);
    return normalized === 'тип' || normalized.startsWith('тип');
};

const isPositionLabel = (label) => {
    const normalized = normalizeLabelForMatch(label);
    return normalized === 'поз' || normalized.startsWith('поз') || normalized.startsWith('позиц');
};

const getColumnKeyByLabel = (columns, predicate) => {
    const targetColumn = columns.find((column) => predicate(normalizeValue(column.label).toLowerCase()));
    return targetColumn?.key || null;
};

const findColumnByAliases = (columns, aliases) => {
    const normalizedAliases = aliases.map((alias) => normalizeLabelForMatch(alias));
    return columns.find((column) => normalizedAliases.includes(normalizeLabelForMatch(column.label))) || null;
};

const isAssemblyType = (typeValue) => normalizeValue(typeValue).toUpperCase().startsWith('СБ');

const isNestedPosition = (parentPosition, candidatePosition) => {
    const normalizedParent = normalizeValue(parentPosition);
    const normalizedCandidate = normalizeValue(candidatePosition);

    if (!normalizedParent || !normalizedCandidate || normalizedParent === normalizedCandidate) {
        return false;
    }

    if (!normalizedCandidate.startsWith(normalizedParent)) {
        return false;
    }

    const nextSymbol = normalizedCandidate.charAt(normalizedParent.length);

    return ['.', '-', '/', '\\', ' '].includes(nextSymbol);
};

const getAssemblyChildRowIds = (rows, positionColumnKey, parentPosition) => {
    const normalizedParentPosition = normalizeValue(parentPosition);

    if (!positionColumnKey || !normalizedParentPosition) {
        return [];
    }

    return rows
        .filter((row) => isNestedPosition(normalizedParentPosition, row[positionColumnKey]))
        .map((row) => row.id);
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

const DesignDocsWorkspace = ({ activeSubItem, namingLogin }) => {
    const uploadInputRef = useRef(null);
    const verifyInputRef = useRef(null);

    const [productName, setProductName] = useState('');
    const [specificationName, setSpecificationName] = useState('');
    const [selectedSpecType, setSelectedSpecType] = useState('Basic');
    const [selectedUploadFile, setSelectedUploadFile] = useState(null);
    const [productList, setProductList] = useState([]);
    const [specificationHistory, setSpecificationHistory] = useState([]);
    const [isSpecificationHistoryLoading, setIsSpecificationHistoryLoading] = useState(false);
    const [specificationHistoryError, setSpecificationHistoryError] = useState('');
    const [specVersion, setSpecVersion] = useState(1);
    const [specComment, setSpecComment] = useState('');
    const [isSpecSaving, setIsSpecSaving] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);
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
    const [generalCheckInProgress, setGeneralCheckInProgress] = useState(false);
    const [namingIssuesByRowId, setNamingIssuesByRowId] = useState({});
    const [namingReport, setNamingReport] = useState(null);
    const [namingLogs, setNamingLogs] = useState([]);
    const [isNamingLogOpen, setIsNamingLogOpen] = useState(false);
    const [generalCheckReport, setGeneralCheckReport] = useState(null);
    const [drawingPreview, setDrawingPreview] = useState(null);
    const [drawingPreviewError, setDrawingPreviewError] = useState('');

    const appendNamingLog = useCallback((message) => {
        setNamingLogs((prevState) => [...prevState, message]);
    }, []);

    const copyNamingLogs = useCallback(async () => {
        const textToCopy = (namingLogs || []).join('\n');

        if (!textToCopy.trim()) {
            return;
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
        } catch {
            alert('Не удалось скопировать текст.');
        }
    }, [namingLogs]);

    useEffect(() => {
        let isMounted = true;

        const loadVerificationSettings = async () => {
            try {
                const response = await fetch(verificationApi.settings);

                if (!response.ok) {
                    throw new Error('Не удалось загрузить параметры верификации.');
                }

                const data = await response.json();
                const nextParams = normalizeVerificationParams(data.typeRules);
                const nextSpecificationSettings = normalizeSpecificationSettings(data.specificationSettings);

                if (!isMounted) {
                    return;
                }

                setVerificationParams(nextParams);
                setSavedVerificationParams(nextParams.map((row) => ({ ...row })));
                setSpecificationSettings(nextSpecificationSettings);
                setSavedSpecificationSettings({ ...nextSpecificationSettings });
            } catch (error) {
                alert(error instanceof Error ? error.message : 'Ошибка загрузки параметров верификации.');
            }
        };

        loadVerificationSettings();

        return () => {
            isMounted = false;
        };
    }, []);


    const loadProductNames = useCallback(async () => {
        const response = await fetch(specificationUploadApi.products);

        if (!response.ok) {
            throw new Error('Не удалось загрузить список наименований.');
        }

        const data = await response.json();
        setProductList(Array.isArray(data.productNames) ? data.productNames : []);
    }, []);

    useEffect(() => {
        loadProductNames().catch((error) => {
            alert(error instanceof Error ? error.message : 'Ошибка загрузки списка изделий.');
        });
    }, [loadProductNames]);

    useEffect(() => {
        if (activeSubItem !== 1) {
            return;
        }

        const controller = new AbortController();

        const loadSpecificationHistory = async () => {
            setIsSpecificationHistoryLoading(true);
            setSpecificationHistoryError('');

            try {
                const response = await fetch(specificationUploadApi.specifications, { signal: controller.signal });

                if (!response.ok) {
                    throw new Error('Не удалось загрузить список спецификаций.');
                }

                const data = await response.json();
                setSpecificationHistory(Array.isArray(data) ? data : []);
            } catch (error) {
                if (controller.signal.aborted) {
                    return;
                }

                setSpecificationHistory([]);
                setSpecificationHistoryError(error instanceof Error ? error.message : 'Ошибка загрузки списка спецификаций.');
            } finally {
                if (!controller.signal.aborted) {
                    setIsSpecificationHistoryLoading(false);
                }
            }
        };

        loadSpecificationHistory();

        return () => {
            controller.abort();
        };
    }, [activeSubItem]);

    useEffect(() => {
        const normalizedProductName = (productName.trim() || specificationName.trim());

        if (!normalizedProductName) {
            setSpecVersion(1);
            return;
        }

        const controller = new AbortController();

        const loadSpecificationData = async () => {
            const query = encodeURIComponent(normalizedProductName);
            const versionResponse = await fetch(`${specificationUploadApi.nextVersion}?productName=${query}&specType=${selectedSpecType}`, { signal: controller.signal });

            if (!versionResponse.ok) {
                throw new Error('Не удалось определить следующую версию спецификации.');
            }

            const versionData = await versionResponse.json();
            setSpecVersion(Number(versionData.nextVersion) || 1);
        };

        loadSpecificationData().catch((error) => {
            if (controller.signal.aborted) {
                return;
            }

            alert(error instanceof Error ? error.message : 'Ошибка загрузки спецификаций.');
        });

        return () => controller.abort();
    }, [productName, selectedSpecType, specificationName]);

    const handleSpecFileChange = useCallback((file) => {
        setSelectedUploadFile(file);
    }, []);

    const handleSelectProduct = useCallback((name) => {
        setProductName(name);
    }, []);

    const handleSaveSpecification = useCallback(async () => {
        const normalizedProductName = (productName.trim() || specificationName.trim());

        if (!specificationName.trim()) {
            alert('Укажите наименование спецификации.');
            return;
        }

        if (!selectedUploadFile) {
            alert('Выберите Excel-файл спецификации.');
            return;
        }

        setIsSpecSaving(true);

        try {
            const formData = new FormData();
            formData.append('productName', normalizedProductName);
            formData.append('specificationName', specificationName.trim());
            formData.append('specType', selectedSpecType);
            formData.append('version', String(specVersion));
            formData.append('comment', specComment.trim());
            formData.append('uploadedBy', String(namingLogin ?? '').trim());
            formData.append('file', selectedUploadFile);

            const response = await fetch(specificationUploadApi.upload, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Не удалось отправить спецификацию в 1С.');
            }

            setUploadStatus({ success: true, message: data.message || 'Спецификация успешно загружена.' });
            setSelectedUploadFile(null);
            setSpecComment('');
            await loadProductNames();

            const query = encodeURIComponent(normalizedProductName);
            const versionResponse = await fetch(`${specificationUploadApi.nextVersion}?productName=${query}&specType=${selectedSpecType}`);
            const versionData = versionResponse.ok ? await versionResponse.json() : { nextVersion: specVersion + 1 };
            setSpecVersion(Number(versionData.nextVersion) || (specVersion + 1));
        } catch (error) {
            setUploadStatus({ success: false, message: error instanceof Error ? error.message : 'Ошибка загрузки спецификации.' });
        } finally {
            setIsSpecSaving(false);
        }
    }, [loadProductNames, namingLogin, productName, selectedSpecType, selectedUploadFile, specComment, specVersion, specificationName]);

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
        setCheckedRows((prevState) => {
            const toggledRow = tableRows.find((row) => row.id === rowId);

            if (!toggledRow) {
                return prevState;
            }

            const nextCheckedValue = !prevState[rowId];
            const nextState = {
                ...prevState,
                [rowId]: nextCheckedValue
            };
            const typeColumnKey = getColumnKeyByLabel(tableColumns, isTypeLabel);
            const positionColumnKey = getColumnKeyByLabel(tableColumns, isPositionLabel);
            const toggledType = typeColumnKey ? toggledRow[typeColumnKey] : null;

            if (!isAssemblyType(toggledType)) {
                return nextState;
            }

            const childRowIds = getAssemblyChildRowIds(tableRows, positionColumnKey, toggledRow[positionColumnKey]);

            childRowIds.forEach((childRowId) => {
                nextState[childRowId] = nextCheckedValue;
            });

            return nextState;
        });
    }, [tableColumns, tableRows]);

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
        setGeneralCheckReport(null);
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
                    description: rule.description,
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
                    const issueSeverity = normalizeVerificationSeverity(issue.severity);

                    if (!issueSeverity) {
                        return;
                    }

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
        setNamingLogs([]);
        setIsNamingLogOpen(true);

        if (errorMessage) {
            appendNamingLog(errorMessage);
            alert(errorMessage);
            return;
        }

        if (!nameColumnKey) {
            appendNamingLog('Не найден столбец «Наименование».');
            alert('Не найден столбец «Наименование».');
            return;
        }

        if (!namingRows.length) {
            setNamingIssuesByRowId({});
            setNamingReport({
                isSuccess: true,
                message: 'Все названия соответствует базе 1С'
            });
            appendNamingLog('Подходящие строки отсутствуют: проверка не выполнена.');
            alert('Для проверки не найдено деталей с типами: Компл, Крепеж, Крепеж_св.');
            return;
        }

        setNamingCheckInProgress(true);
        setNamingLogs(['Отправлен запрос на сервер. Ожидаем ответ.']);
        const timeoutMs = 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(verificationApi.naming, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ items: namingRows }),
                signal: controller.signal
            });

            if (!response.ok) {
                let serverMessage = `Ошибка запроса к сервису Нейминг (HTTP ${response.status}).`;

                try {
                    const errorPayload = await response.json();
                    const detail = typeof errorPayload?.detail === 'string' ? errorPayload.detail.trim() : '';
                    const title = typeof errorPayload?.title === 'string' ? errorPayload.title.trim() : '';
                    const combinedMessage = detail || title;

                    if (combinedMessage) {
                        serverMessage = combinedMessage;
                    }
                } catch (parseError) {
                    void parseError;
                }

                throw new Error(serverMessage);
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
                setNamingLogs([successMessage]);
                return;
            }

            const reportLines = notFoundRows.map((item) => `${item.rowId}. ${item.name} — ${item.status}`);
            const reportTitle = 'Найдены отсутствующие наименования в базе 1С:';

            setNamingReport({
                isSuccess: false,
                message: `Не найдено в базе 1С: ${notFoundRows.length}`
            });
            setNamingLogs([reportTitle, ...reportLines]);
        } catch (error) {
            const noResponseMessage = 'Нет ответа от сервера, повторите позже.';

            if (error instanceof Error && error.name === 'AbortError') {
                setNamingLogs([noResponseMessage]);
            } else {
                const errorMessage = error instanceof Error ? error.message : 'Ошибка выполнения проверки Нейминг.';
                setNamingLogs([errorMessage]);
            }
        } finally {
            clearTimeout(timeoutId);
            setNamingCheckInProgress(false);
        }
    }, [appendNamingLog, sortedRows, tableColumns]);

    const runGeneralCheck = useCallback(() => {
        setGeneralCheckInProgress(true);

        try {
            const requiredColumns = parseSettingsList(specificationSettings.columns, { splitByComma: false });
            const coverageOptions = parseSettingsList(specificationSettings.coverage).map((item) => normalizeCellForCompare(item));
            const primerOptions = parseSettingsList(specificationSettings.primer).map((item) => normalizeCellForCompare(item));

            const availableColumns = tableColumns.map((column) => normalizeLabelForMatch(column.label));
            const missingColumns = requiredColumns.filter((columnName) => !availableColumns.includes(normalizeLabelForMatch(columnName)));

            const qtyColumn = findColumnByAliases(tableColumns, ['Кол', 'Количество']);
            const typeColumn = findColumnByAliases(tableColumns, ['Тип']);
            const thicknessColumn = findColumnByAliases(tableColumns, ['Толщина (мм)', 'Толщина']);
            const materialColumn = findColumnByAliases(tableColumns, ['Материал']);
            const materialEnColumn = findColumnByAliases(tableColumns, ['Материал EN', 'МатериалEN']);
            const coverageColumn = findColumnByAliases(tableColumns, ['Покрытие']);
            const paintSidesColumn = findColumnByAliases(tableColumns, ['Кол-во сторон покраски', 'Количество сторон покраски']);
            const primerColumn = findColumnByAliases(tableColumns, ['Грунтовка']);

            const issuesByType = {
                '1) Проверка столбцов': [],
                '2) Проверка количества': [],
                '3) Проверка обязательных полей деталей': [],
                '4) Проверка покрытие': [],
                '5) Проверка кол-ва сторон покраски': [],
                '6) Проверка грунтовки': []
            };

            if (missingColumns.length) {
                issuesByType['1) Проверка столбцов'].push(`Не найдены обязательные столбцы: ${missingColumns.join(', ')}`);
            }

            if (!qtyColumn) {
                issuesByType['2) Проверка количества'].push('Не найден столбец «Кол»/«Количество».');
            }

            const typesForRequiredFields = new Set(['деталь_св', 'деталь', 'деталь_кон']);
            const uncoatedValue = normalizeCellForCompare('Без покрытия/Uncoated');

            sortedRows.forEach((row) => {
                const rowId = row.id;

                if (qtyColumn) {
                    const qtyValue = Number.parseFloat(String(row[qtyColumn.key] ?? '').replace(',', '.'));
                    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
                        issuesByType['2) Проверка количества'].push(`Строка ${rowId}: в столбце «${qtyColumn.label}» должно быть число больше 0.`);
                    }
                }

                const typeValue = normalizeCellForCompare(typeColumn ? row[typeColumn.key] : '');
                const requiresDetailFields = typesForRequiredFields.has(typeValue);

                if (requiresDetailFields) {
                    if (!thicknessColumn || !normalizeValue(row[thicknessColumn.key])) {
                        issuesByType['3) Проверка обязательных полей деталей'].push(`Строка ${rowId}: для ТИП «${row[typeColumn.key]}» заполните «Толщина (мм)».`);
                    }

                    if (!materialColumn || !normalizeValue(row[materialColumn.key])) {
                        issuesByType['3) Проверка обязательных полей деталей'].push(`Строка ${rowId}: для ТИП «${row[typeColumn.key]}» заполните «Материал».`);
                    }

                    if (!materialEnColumn || !normalizeValue(row[materialEnColumn.key])) {
                        issuesByType['3) Проверка обязательных полей деталей'].push(`Строка ${rowId}: для ТИП «${row[typeColumn.key]}» заполните «Материал EN».`);
                    }
                }

                if (coverageColumn && coverageOptions.length) {
                    const coverageValue = normalizeCellForCompare(row[coverageColumn.key]);
                    if (coverageValue && !coverageOptions.includes(coverageValue)) {
                        issuesByType['4) Проверка покрытие'].push(`Строка ${rowId}: значение «${row[coverageColumn.key]}» отсутствует в настройках «Покрытие».`);
                    }

                    if (coverageValue && coverageValue !== uncoatedValue) {
                        if (!paintSidesColumn) {
                            issuesByType['5) Проверка кол-ва сторон покраски'].push('Не найден столбец «Кол-во сторон покраски».');
                        } else {
                            const sidesValue = normalizeValue(row[paintSidesColumn.key]);
                            if (sidesValue !== '1' && sidesValue !== '2') {
                                issuesByType['5) Проверка кол-ва сторон покраски'].push(`Строка ${rowId}: для покрытия «${row[coverageColumn.key]}» в «${paintSidesColumn.label}» должно быть 1 или 2.`);
                            }
                        }
                    }
                }

                if (primerColumn && primerOptions.length) {
                    const primerValue = normalizeCellForCompare(row[primerColumn.key]);
                    if (primerValue && !primerOptions.includes(primerValue)) {
                        issuesByType['6) Проверка грунтовки'].push(`Строка ${rowId}: значение «${row[primerColumn.key]}» отсутствует в настройках «Грунтовка».`);
                    }
                }
            });

            const blocks = Object.entries(issuesByType)
                .map(([type, items]) => ({ type, items }))
                .filter((block) => block.items.length > 0)
                .map((block) => ({
                    ...block,
                    items: [...new Set(block.items)]
                }));

            if (!blocks.length) {
                setGeneralCheckReport({
                    isSuccess: true,
                    blocks: []
                });
                return;
            }

            setGeneralCheckReport({
                isSuccess: false,
                blocks
            });
        } finally {
            setGeneralCheckInProgress(false);
        }
    }, [sortedRows, specificationSettings.columns, specificationSettings.coverage, specificationSettings.primer, tableColumns]);

    const namingTargetColumnKey = useMemo(() => {
        const nameColumn = tableColumns.find((column) => column.label.toLowerCase().includes('наимен'));
        return nameColumn?.key || null;
    }, [tableColumns]);

    const designationTargetColumnKey = useMemo(() => {
        const preferredColumn = findColumnByAliases(tableColumns, preferredDesignationColumnLabels);
        if (preferredColumn) {
            return preferredColumn.key;
        }

        const designationColumn = tableColumns.find((column) => normalizeValue(column.label).toLowerCase().includes('обознач'));
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

    const handleSaveSettings = async () => {
        try {
            const response = await fetch(verificationApi.settings, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    typeRules: verificationParams.map((rule) => ({
                        type: rule.type,
                        description: rule.description,
                        condition: rule.condition
                    })),
                    specificationSettings
                })
            });

            if (!response.ok) {
                throw new Error('Не удалось сохранить параметры верификации.');
            }

            const savedSettings = await response.json();
            const normalizedSavedParams = normalizeVerificationParams(savedSettings.typeRules);
            const normalizedSavedSpecificationSettings = normalizeSpecificationSettings(savedSettings.specificationSettings);

            setVerificationParams(normalizedSavedParams);
            setSavedVerificationParams(normalizedSavedParams.map((row) => ({ ...row })));
            setSpecificationSettings(normalizedSavedSpecificationSettings);
            setSavedSpecificationSettings({ ...normalizedSavedSpecificationSettings });
            alert('Параметры верификации сохранены.');
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Ошибка сохранения параметров верификации.');
        }
    };


    const handleCancelSpecificationUpload = useCallback(() => {
        setProductName('');
        setSpecificationName('');
        setSelectedSpecType('Basic');
        setSelectedUploadFile(null);
        setSpecComment('');
    }, []);

    const handleCancelSettings = () => {
        setVerificationParams(savedVerificationParams.map((row) => ({ ...row })));
        setSpecificationSettings({ ...savedSpecificationSettings });
    };

    const handleDrawingPreviewRequest = useCallback(async (detailName) => {
        const normalizedDetailName = String(detailName ?? '').trim();

        if (!normalizedDetailName) {
            return;
        }

        setDrawingPreviewError('');

        const query = new URLSearchParams({ detailName: normalizedDetailName });
        const response = await fetch(`${fileIndexApi.drawingPreview}?${query.toString()}`);

        if (!response.ok) {
            const errorText = (await response.text()).trim();
            throw new Error(errorText || 'Чертеж не найден');
        }

        const contentType = response.headers.get('Content-Type') || '';
        const filePath = response.headers.get('X-Drawing-Path') || '';
        const fileName = response.headers.get('X-Drawing-FileName') || normalizedDetailName;
        const blob = await response.blob();
        const previewUrl = URL.createObjectURL(blob);

        setDrawingPreview((prevState) => {
            if (prevState?.url) {
                URL.revokeObjectURL(prevState.url);
            }

            return {
                detailName: normalizedDetailName,
                fileName,
                filePath,
                url: previewUrl,
                contentType
            };
        });
    }, []);

    const closeDrawingPreview = useCallback(() => {
        setDrawingPreview((prevState) => {
            if (prevState?.url) {
                URL.revokeObjectURL(prevState.url);
            }

            return null;
        });
    }, []);

    const openDrawingPreviewError = useCallback((message) => {
        setDrawingPreviewError(String(message ?? '').trim() || 'Чертеж не найден');
    }, []);

    const closeDrawingPreviewError = useCallback(() => {
        setDrawingPreviewError('');
    }, []);

    return (
        <>
            <div className={`design-docs-subview ${activeSubItem === 0 ? 'active' : ''}`}>
                <SpecificationUploadView
                    specificationName={specificationName}
                    onSpecificationNameChange={setSpecificationName}
                    selectedSpecType={selectedSpecType}
                    onSpecTypeChange={setSelectedSpecType}
                    comment={specComment}
                    onCommentChange={setSpecComment}
                    uploadFileName={selectedUploadFile?.name || ''}
                    uploadInputRef={uploadInputRef}
                    onUploadFileChange={handleSpecFileChange}
                    onSave={handleSaveSpecification}
                    onCancel={handleCancelSpecificationUpload}
                    isSaving={isSpecSaving}
                    productList={productList}
                    isProductDialogOpen={false}
                    onCloseProductDialog={() => {}}
                    onSelectProduct={handleSelectProduct}
                    uploadStatus={uploadStatus}
                    onCloseStatusDialog={() => setUploadStatus(null)}
                />
            </div>

            <div className={`design-docs-subview ${activeSubItem === 1 ? 'active' : ''}`}>
                <SpecificationListView
                    specifications={specificationHistory}
                    isLoading={isSpecificationHistoryLoading}
                    loadError={specificationHistoryError}
                />
            </div>

            <div className={`design-docs-subview ${activeSubItem === 2 ? 'active' : ''}`}>
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
                    onRunGeneralCheck={runGeneralCheck}
                    generalCheckInProgress={generalCheckInProgress}
                    namingIssuesByRowId={namingIssuesByRowId}
                    namingTargetColumnKey={namingTargetColumnKey}
                    namingReport={namingReport}
                    namingLogs={namingLogs}
                    isNamingLogOpen={isNamingLogOpen}
                    onCopyNamingLog={copyNamingLogs}
                    onCloseNamingLog={() => setIsNamingLogOpen(false)}
                    verificationIssuesByRowId={verificationIssuesByRowId}
                    verificationReport={verificationReport}
                    onCloseVerificationReport={() => setVerificationReport(null)}
                    generalCheckReport={generalCheckReport}
                    onCloseGeneralCheckReport={() => setGeneralCheckReport(null)}
                    designationTargetColumnKey={designationTargetColumnKey}
                    onRequestDrawingPreview={handleDrawingPreviewRequest}
                    drawingPreview={drawingPreview}
                    onCloseDrawingPreview={closeDrawingPreview}
                    drawingPreviewError={drawingPreviewError}
                    onCloseDrawingPreviewError={closeDrawingPreviewError}
                    onDrawingPreviewError={openDrawingPreviewError}
                />
            </div>

            <div className={`design-docs-subview ${activeSubItem !== 0 && activeSubItem !== 1 && activeSubItem !== 2 ? 'active' : ''}`}>
                <DesignDocsSettingsView
                    verificationParams={verificationParams}
                    onVerificationParamChange={handleVerificationParamChange}
                    specificationSettings={specificationSettings}
                    onSpecificationSettingChange={handleSpecificationSettingChange}
                    onSave={handleSaveSettings}
                    onCancel={handleCancelSettings}
                />
            </div>
        </>
    );
};

export default DesignDocsWorkspace;
