import React, { useMemo, useRef, useState } from 'react';
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

const tableColumns = [
    { key: 'code', label: 'Код детали' },
    { key: 'name', label: 'Наименование' },
    { key: 'material', label: 'Материал' },
    { key: 'qty', label: 'Количество' }
];

const DesignDocsWorkspace = ({ activeSubItem }) => {
    const uploadInputRef = useRef(null);
    const verifyInputRef = useRef(null);
    const pdfFolderInputRef = useRef(null);

    const [productName, setProductName] = useState('');
    const [specName, setSpecName] = useState('');
    const [uploadFile, setUploadFile] = useState('');
    const [pdfPath, setPdfPath] = useState('C:/SLS/KD/PDF_DXF');
    const [savedPdfPath, setSavedPdfPath] = useState('C:/SLS/KD/PDF_DXF');

    const [sortState, setSortState] = useState({ key: 'code', direction: 'asc' });
    const [checkedRows, setCheckedRows] = useState({});
    const [columnFilters, setColumnFilters] = useState({});
    const [columnWidths, setColumnWidths] = useState({
        code: 170,
        name: 280,
        material: 220,
        qty: 140
    });

    const filteredRows = useMemo(() => {
        return sampleSpecs.filter((row) => tableColumns.every((column) => {
            const selectedValues = columnFilters[column.key];

            if (!selectedValues || selectedValues.length === 0) {
                return true;
            }

            return selectedValues.includes(String(row[column.key]));
        }));
    }, [columnFilters]);

    const sortedRows = useMemo(() => {
        const rows = [...filteredRows];
        const { key, direction } = sortState;
        const directionFactor = direction === 'asc' ? 1 : -1;

        rows.sort((firstRow, secondRow) => {
            const firstValue = firstRow[key];
            const secondValue = secondRow[key];

            if (firstValue === secondValue) {
                return 0;
            }

            return firstValue > secondValue ? directionFactor : -directionFactor;
        });

        return rows;
    }, [filteredRows, sortState]);

    const filterOptions = useMemo(() => {
        const options = {};

        tableColumns.forEach((column) => {
            options[column.key] = [...new Set(sampleSpecs.map((row) => String(row[column.key])))];
        });

        return options;
    }, []);

    const visibleRowIds = sortedRows.map((row) => row.id);
    const allVisibleChecked = visibleRowIds.length > 0 && visibleRowIds.every((id) => checkedRows[id]);

    const toggleSort = (key) => {
        setSortState((prevState) => {
            if (prevState.key === key) {
                return {
                    key,
                    direction: prevState.direction === 'asc' ? 'desc' : 'asc'
                };
            }

            return { key, direction: 'asc' };
        });
    };

    const toggleRow = (rowId) => {
        setCheckedRows((prevState) => ({
            ...prevState,
            [rowId]: !prevState[rowId]
        }));
    };

    const toggleAllVisible = () => {
        setCheckedRows((prevState) => {
            const nextState = { ...prevState };

            visibleRowIds.forEach((rowId) => {
                nextState[rowId] = !allVisibleChecked;
            });

            return nextState;
        });
    };

    const setFilter = (columnKey, values) => {
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
    };

    const setColumnWidth = (columnKey, width) => {
        setColumnWidths((prevState) => ({
            ...prevState,
            [columnKey]: width
        }));
    };

    const handleBrowsePdfFolder = async () => {
        if (window.showDirectoryPicker) {
            try {
                const directoryHandle = await window.showDirectoryPicker();
                setPdfPath(directoryHandle.name);
                return;
            } catch {
                return;
            }
        }

        pdfFolderInputRef.current?.click();
    };

    const handlePdfFolderFallback = (event) => {
        const file = event.target.files?.[0];
        const folderName = file?.webkitRelativePath?.split('/')[0] || '';

        if (folderName) {
            setPdfPath(folderName);
        }
    };

    const handleSavePdfPath = () => {
        setSavedPdfPath(pdfPath);
    };

    const handleCancelPdfPath = () => {
        setPdfPath(savedPdfPath);
    };

    if (activeSubItem === 0) {
        return (
            <SpecificationUploadView
                productName={productName}
                onProductNameChange={setProductName}
                specName={specName}
                onSpecNameChange={setSpecName}
                uploadFile={uploadFile}
                uploadInputRef={uploadInputRef}
                onUploadFileChange={setUploadFile}
            />
        );
    }

    if (activeSubItem === 1) {
        return (
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
            />
        );
    }

    return (
        <DesignDocsSettingsView
            pdfPath={pdfPath}
            onPdfPathChange={setPdfPath}
            onBrowsePdfFolder={handleBrowsePdfFolder}
            pdfFolderInputRef={pdfFolderInputRef}
            onPdfFolderFallbackChange={handlePdfFolderFallback}
            onSave={handleSavePdfPath}
            onCancel={handleCancelPdfPath}
        />
    );
};

export default DesignDocsWorkspace;
