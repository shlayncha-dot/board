import React from 'react';

const SpecificationUploadView = ({
    productName,
    onProductNameChange,
    specName,
    onSpecNameChange,
    uploadFile,
    uploadInputRef,
    onUploadFileChange
}) => {
    return (
        <section className="design-docs-page">
            <div className="spec-upload-layout">
                <article className="spec-card">
                    <label className="field-group">
                        Наименование изделия
                        <input
                            type="text"
                            value={productName}
                            onChange={(event) => onProductNameChange(event.target.value)}
                            placeholder="Введите наименование изделия"
                        />
                    </label>

                    <label className="field-group">
                        Наименование спецификации
                        <input
                            type="text"
                            value={specName}
                            onChange={(event) => onSpecNameChange(event.target.value)}
                            placeholder="Введите наименование спецификации"
                        />
                    </label>

                    <div className="field-group">
                        Файл спецификации (Excel)
                        <div className="inline-file-upload">
                            <input type="text" value={uploadFile} readOnly placeholder="Файл не выбран" />
                            <button type="button" onClick={() => uploadInputRef.current?.click()}>
                                Выбрать файл
                            </button>
                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept=".xls,.xlsx"
                                className="hidden-input"
                                onChange={(event) => onUploadFileChange(event.target.files?.[0]?.name || '')}
                            />
                        </div>
                    </div>

                    <button type="button" className="save-btn">Сохранить</button>
                </article>

                <article className="spec-card info-card">
                    <h2>Список спецификаций по текущей номенклатуре</h2>
                    <ul>
                        <li>СП-101 / Корпус базовый</li>
                        <li>СП-102 / Корпус с усилением</li>
                        <li>СП-103 / Узел крепления</li>
                        <li>СП-104 / Финальная сборка</li>
                    </ul>
                </article>
            </div>
        </section>
    );
};

export default SpecificationUploadView;
