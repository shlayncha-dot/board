import React from 'react';

const SpecificationUploadView = ({
    productName,
    onProductNameChange,
    onOpenProductList,
    selectedSpecType,
    onSpecTypeChange,
    uploadFileName,
    uploadInputRef,
    onUploadFileChange,
    specsByProduct,
    specVersion,
    onSave,
    isSaving,
    productList,
    isProductDialogOpen,
    onCloseProductDialog,
    onSelectProduct,
    uploadStatus,
    onCloseStatusDialog
}) => {
    return (
        <section className="design-docs-page">
            <div className="spec-upload-layout spec-upload-layout-single">
                <article className="spec-card">
                    <h2>Загрузка спецификации</h2>

                    <div className="spec-product-row">
                        <label className="field-group spec-product-field">
                            Наименование изделия
                            <input
                                type="text"
                                value={productName}
                                onChange={(event) => onProductNameChange(event.target.value)}
                                placeholder="Введите или выберите наименование"
                            />
                        </label>
                        <button type="button" className="cancel-btn" onClick={onOpenProductList}>
                            Список наименований
                        </button>
                    </div>

                    <label className="field-group">
                        Тип спецификации
                        <select value={selectedSpecType} onChange={(event) => onSpecTypeChange(event.target.value)}>
                            <option value="Basic">Basic — Базовая</option>
                            <option value="Wire">Wire — Жгуты</option>
                            <option value="Packaging">Packaging — Упаковка</option>
                            <option value="Tech">Tech — Технологичная</option>
                        </select>
                    </label>

                    <div className="field-group">
                        Загрузить Excel
                        <div className="inline-file-upload">
                            <input type="text" value={uploadFileName} readOnly placeholder="Файл не выбран" />
                            <button type="button" onClick={() => uploadInputRef.current?.click()}>
                                Загрузить Excel
                            </button>
                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept=".xls,.xlsx"
                                className="hidden-input"
                                onChange={(event) => onUploadFileChange(event.target.files?.[0] || null)}
                            />
                        </div>
                    </div>

                    <label className="field-group">
                        Версия спецификации
                        <input type="text" readOnly value={specVersion || '—'} />
                    </label>

                    <div className="field-group">
                        Список всех спецификаций по текущей номенклатуре
                        <div className="spec-history-list">
                            {specsByProduct.length === 0 ? (
                                <p className="spec-empty-state">Для выбранной номенклатуры спецификации пока не загружены.</p>
                            ) : (
                                <ul>
                                    {specsByProduct.map((item) => (
                                        <li key={`${item.specificationCode}-${item.uploadedAtUtc}`}>
                                            <strong>{item.specificationCode}</strong> — v{item.version} ({item.specType})
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <button type="button" className="save-btn" onClick={onSave} disabled={isSaving}>
                        {isSaving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                </article>
            </div>

            {isProductDialogOpen ? (
                <div className="route-sheets-dialog-overlay" role="presentation">
                    <div className="route-sheets-dialog" role="dialog" aria-modal="true" aria-label="Список наименований изделий">
                        <h3>Ранее созданные наименования изделий</h3>
                        {productList.length === 0 ? (
                            <p>На сервере пока нет сохраненных наименований.</p>
                        ) : (
                            <ul className="spec-product-options">
                                {productList.map((name) => (
                                    <li key={name}>
                                        <button type="button" className="cancel-btn" onClick={() => onSelectProduct(name)}>
                                            {name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="route-sheets-dialog-actions">
                            <button type="button" className="cancel-btn" onClick={onCloseProductDialog}>Закрыть</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {uploadStatus ? (
                <div className="verification-report-overlay" role="dialog" aria-modal="true">
                    <div className="verification-report-modal">
                        <h3>Статус загрузки</h3>
                        <p>{uploadStatus.message}</p>
                        <div className="verification-report-actions">
                            <button type="button" className="save-btn" onClick={onCloseStatusDialog}>Ок</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
};

export default SpecificationUploadView;
