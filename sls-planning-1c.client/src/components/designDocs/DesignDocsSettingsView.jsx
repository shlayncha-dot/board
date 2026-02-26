import React from 'react';

const DesignDocsSettingsView = ({
    pdfPath,
    onPdfPathChange,
    onBrowsePdfFolder,
    pdfFolderInputRef,
    onPdfFolderFallbackChange,
    verificationParams,
    onVerificationParamChange,
    onSave,
    onCancel
}) => {
    return (
        <section className="design-docs-page design-docs-settings-page">
            <div className="settings-horizontal-group">
                <h2>Путь к файлам PDF/DXF</h2>
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

            <div className="settings-horizontal-group verification-group">
                <h2>Параметры верификации</h2>
                <div className="verification-matrix">
                    <div className="verification-matrix-head" />
                    <div className="verification-matrix-head">Описание</div>
                    <div className="verification-matrix-head">Условие</div>

                    {verificationParams.map((row, index) => (
                        <React.Fragment key={row.type}>
                            <div className="verification-type-label">ТИП {index + 1}</div>
                            <textarea
                                rows={5}
                                value={row.description}
                                onChange={(event) => onVerificationParamChange(index, 'description', event.target.value)}
                            />
                            <textarea
                                rows={5}
                                value={row.condition}
                                onChange={(event) => onVerificationParamChange(index, 'condition', event.target.value)}
                            />
                        </React.Fragment>
                    ))}
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
