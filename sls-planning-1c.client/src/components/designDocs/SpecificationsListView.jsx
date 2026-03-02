import React from 'react';

const formatDate = (value) => {
    if (!value) {
        return '—';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return date.toLocaleString('ru-RU');
};

const SpecificationsListView = ({ groupedSpecifications, selectedSpecification, onRowDoubleClick, onCloseModal, onEditField, onSaveEdit, isSaving }) => {
    return (
        <section className="design-docs-page">
            <article className="spec-card">
                <h2>Список спецификаций</h2>

                <div className="spec-list-table-wrap">
                    <table className="verification-report-table spec-list-table">
                        <thead>
                            <tr>
                                <th>Наименование изделия / спецификация</th>
                                <th>Версия</th>
                                <th>Тип</th>
                                <th>Дата</th>
                                <th>Автор</th>
                                <th>Комментарий</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupedSpecifications.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>Спецификации пока не загружены.</td>
                                </tr>
                            ) : (
                                groupedSpecifications.map((group) => (
                                    <React.Fragment key={group.productName}>
                                        <tr className="spec-product-row">
                                            <td colSpan={6}>{group.productName}</td>
                                        </tr>
                                        {group.specifications.map((row) => (
                                            <tr
                                                key={row.specificationCode}
                                                className="spec-item-row"
                                                onDoubleClick={() => onRowDoubleClick(row)}
                                                title="Двойной клик для редактирования"
                                            >
                                                <td className="spec-item-name">↳ {row.specificationName}</td>
                                                <td>{row.version}</td>
                                                <td>{row.specType}</td>
                                                <td>{formatDate(row.uploadedAtUtc)}</td>
                                                <td>{row.uploadedBy || '—'}</td>
                                                <td>{row.comment || '—'}</td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </article>

            {selectedSpecification ? (
                <div className="verification-report-overlay" role="dialog" aria-modal="true">
                    <div className="verification-report-modal">
                        <h3>Редактирование спецификации</h3>
                        <div className="spec-edit-grid">
                            <label className="field-group">
                                Наименование изделия
                                <input value={selectedSpecification.productName} onChange={(event) => onEditField('productName', event.target.value)} />
                            </label>
                            <label className="field-group">
                                Название спецификации
                                <input value={selectedSpecification.specificationName} onChange={(event) => onEditField('specificationName', event.target.value)} />
                            </label>
                            <label className="field-group">
                                Версия
                                <input type="number" min={1} value={selectedSpecification.version} onChange={(event) => onEditField('version', Number(event.target.value) || 1)} />
                            </label>
                            <label className="field-group">
                                Тип
                                <select value={selectedSpecification.specType} onChange={(event) => onEditField('specType', event.target.value)}>
                                    <option value="Basic">Basic</option>
                                    <option value="Wire">Wire</option>
                                    <option value="Packaging">Packaging</option>
                                    <option value="Tech">Tech</option>
                                </select>
                            </label>
                            <label className="field-group">
                                Автор
                                <input value={selectedSpecification.uploadedBy} onChange={(event) => onEditField('uploadedBy', event.target.value)} />
                            </label>
                            <label className="field-group">
                                Дата
                                <input
                                    type="datetime-local"
                                    value={selectedSpecification.uploadedAtUtcLocal}
                                    onChange={(event) => onEditField('uploadedAtUtcLocal', event.target.value)}
                                />
                            </label>
                            <label className="field-group spec-edit-comment">
                                Комментарий
                                <textarea rows={4} value={selectedSpecification.comment} onChange={(event) => onEditField('comment', event.target.value)} />
                            </label>
                        </div>
                        <div className="verification-report-actions">
                            <button type="button" className="save-btn" onClick={onSaveEdit} disabled={isSaving}>{isSaving ? 'Сохранение…' : 'Редактировать'}</button>
                            <button type="button" className="cancel-btn" onClick={onCloseModal} disabled={isSaving}>Закрыть</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
};

export default SpecificationsListView;
