import React from 'react';

const formatDateTime = (value) => {
    if (!value) {
        return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString('ru-RU');
};

const SpecificationListView = ({
    products,
    selectedProduct,
    onSelectedProductChange,
    specifications,
    isLoading,
    loadError
}) => {
    return (
        <section className="design-docs-page">
            <article className="spec-card">
                <h2>Список спецификаций</h2>

                <label className="field-group spec-product-field">
                    Наименование изделия
                    <select value={selectedProduct} onChange={(event) => onSelectedProductChange(event.target.value)}>
                        <option value="">Выберите изделие</option>
                        {products.map((productName) => (
                            <option key={productName} value={productName}>
                                {productName}
                            </option>
                        ))}
                    </select>
                </label>

                {!selectedProduct ? (
                    <p className="spec-empty-state">Выберите изделие, чтобы увидеть версии спецификаций.</p>
                ) : null}

                {loadError ? <p className="spec-list-error">{loadError}</p> : null}

                {selectedProduct ? (
                    <div className="spec-list-table-wrap">
                        <table className="spec-list-table">
                            <thead>
                                <tr>
                                    <th>Код</th>
                                    <th>Наименование</th>
                                    <th>Тип</th>
                                    <th>Версия</th>
                                    <th>Комментарий</th>
                                    <th>Дата загрузки</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={6}>Загрузка...</td>
                                    </tr>
                                ) : specifications.length === 0 ? (
                                    <tr>
                                        <td colSpan={6}>По выбранному изделию спецификации не найдены.</td>
                                    </tr>
                                ) : (
                                    specifications.map((specification) => (
                                        <tr key={specification.id}>
                                            <td>{specification.specificationCode || '—'}</td>
                                            <td>{specification.specificationName || '—'}</td>
                                            <td>{specification.specType || '—'}</td>
                                            <td>{specification.version ?? '—'}</td>
                                            <td>{specification.comment || '—'}</td>
                                            <td>{formatDateTime(specification.createdAt)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </article>
        </section>
    );
};

export default SpecificationListView;
