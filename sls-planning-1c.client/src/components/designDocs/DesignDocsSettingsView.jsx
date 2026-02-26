import React from 'react';

const DesignDocsSettingsView = ({
    pdfPath,
    onPdfPathChange,
    onBrowsePdfFolder,
    pdfFolderInputRef,
    onPdfFolderFallbackChange,
    onSave,
    onCancel
}) => {
    return (
        <section className="design-docs-page design-docs-settings-page">
            <div className="settings-horizontal-group">
                <h2>Группа 1 — Путь к файлам PDF/DXF</h2>
                <div className="settings-path-row">
                    <input
                        type="text"
                        value={pdfPath}
                        onChange={(event) => onPdfPathChange(event.target.value)}
                    />
                    <button type="button" onClick={onBrowsePdfFolder}>Обзор</button>
                    <input
                        ref={pdfFolderInputRef}
                        type="file"
                        className="hidden-input"
                        webkitdirectory=""
                        directory=""
                        onChange={onPdfFolderFallbackChange}
                    />
                </div>
            </div>

            <div className="design-docs-actions">
                <button type="button" className="save-btn" onClick={onSave}>Сохранить</button>
                <button type="button" className="cancel-btn" onClick={onCancel}>Отмена</button>
            </div>
        </section>
    );
};

export default DesignDocsSettingsView;
