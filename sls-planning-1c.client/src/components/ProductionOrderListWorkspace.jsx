import React, { useState } from 'react';

const DEFAULT_OPEN_DATE = '2024-01-01';

const ProductionOrderListWorkspace = () => {
    const [status, setStatus] = useState('open');
    const [openedAt, setOpenedAt] = useState(DEFAULT_OPEN_DATE);

    return (
        <section className="design-docs-page production-order-list-page">
            <article className="spec-card production-order-list-card">
                <h2>Список заказов на производство</h2>

                <div className="production-order-list-filters">
                    <button type="button" className="production-order-list-generate-btn">
                        Сформировать
                    </button>

                    <label className="field-group production-order-list-filter-field">
                        Статус
                        <select value={status} onChange={(event) => setStatus(event.target.value)}>
                            <option value="open">Открытые</option>
                            <option value="closed">Закрытые</option>
                            <option value="all">Все</option>
                        </select>
                    </label>

                    <label className="field-group production-order-list-filter-field">
                        Дата открытия
                        <input
                            type="date"
                            value={openedAt}
                            onChange={(event) => setOpenedAt(event.target.value)}
                        />
                    </label>
                </div>

                <div className="production-order-list-table-wrap">
                    <table className="production-order-list-table">
                        <thead>
                            <tr>
                                <th>Таблица заказов на производство</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Поле под таблицу создано. Заполнение данными добавим позже.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </article>
        </section>
    );
};

export default ProductionOrderListWorkspace;
