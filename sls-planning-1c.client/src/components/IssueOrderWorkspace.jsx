import React, { useMemo, useState } from 'react';

const ALLOWED_TYPES = new Set(['Деталь_кон', 'Деталь', 'Деталь_св']);

const mockProductionOrders = [
    'ПЗ-1001',
    'ПЗ-1002',
    'ПЗ-1003'
];

const mockNomenclatures = [
    'НК-5001',
    'НК-5002',
    'НК-5003'
];

const mockSpecificationRows = [
    { id: '1', designation: 'A-101', name: 'Кронштейн левый', type: 'Деталь', required: 4, issued: 2 },
    { id: '2', designation: 'A-102', name: 'Кронштейн правый', type: 'Деталь_кон', required: 4, issued: 1 },
    { id: '3', designation: 'A-103', name: 'Панель', type: 'Сборка', required: 2, issued: 0 },
    { id: '4', designation: 'A-104', name: 'Опора', type: 'Деталь_св', required: 8, issued: 5 },
    { id: '5', designation: 'A-105', name: 'Втулка', type: 'Покупное', required: 12, issued: 0 },
    { id: '6', designation: 'A-106', name: 'Планка', type: 'Деталь', required: 10, issued: 7 }
];

const IssueOrderWorkspace = () => {
    const [selectedOrder, setSelectedOrder] = useState('');
    const [selectedNomenclature, setSelectedNomenclature] = useState('');
    const [specRows, setSpecRows] = useState([]);
    const [checkedRows, setCheckedRows] = useState({});

    const canLoadSpecification = selectedOrder && selectedNomenclature;
    const visibleRowIds = specRows.map((row) => row.id);

    const allChecked = useMemo(() => (
        visibleRowIds.length > 0 && visibleRowIds.every((id) => checkedRows[id])
    ), [checkedRows, visibleRowIds]);

    const handleLoadSpecification = () => {
        if (!canLoadSpecification) {
            return;
        }

        const filteredRows = mockSpecificationRows.filter((row) => ALLOWED_TYPES.has(row.type));
        setSpecRows(filteredRows);
        setCheckedRows({});
    };

    const handleToggleAll = () => {
        if (allChecked) {
            setCheckedRows({});
            return;
        }

        const nextState = {};
        visibleRowIds.forEach((id) => {
            nextState[id] = true;
        });
        setCheckedRows(nextState);
    };

    const handleToggleRow = (rowId) => {
        setCheckedRows((prev) => ({
            ...prev,
            [rowId]: !prev[rowId]
        }));
    };

    return (
        <div className="production-order-workspace">
            <h2>Выдать наряд</h2>

            <div className="production-order-controls">
                <label className="production-order-field">
                    <span>Выберете заказ на производствоа</span>
                    <select value={selectedOrder} onChange={(event) => setSelectedOrder(event.target.value)}>
                        <option value="">Выберете заказ</option>
                        {mockProductionOrders.map((order) => (
                            <option key={order} value={order}>{order}</option>
                        ))}
                    </select>
                </label>

                <label className="production-order-field">
                    <span>Выберете номенклатуру</span>
                    <select value={selectedNomenclature} onChange={(event) => setSelectedNomenclature(event.target.value)}>
                        <option value="">Выберете номенклатуру</option>
                        {mockNomenclatures.map((nomenclature) => (
                            <option key={nomenclature} value={nomenclature}>{nomenclature}</option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="production-order-actions">
                <button
                    type="button"
                    className="production-order-create-btn"
                    disabled={!canLoadSpecification}
                    onClick={handleLoadSpecification}
                >
                    Загрузить спецификацию
                </button>
                <button type="button" className="production-order-add-btn" disabled={specRows.length === 0}>
                    Выдать наряд
                </button>
            </div>

            <div className="production-order-table-block">
                <div className="production-order-table-scroll">
                    <table className="production-order-spec-table">
                        <thead>
                            <tr>
                                <th>
                                    <input
                                        type="checkbox"
                                        checked={allChecked}
                                        onChange={handleToggleAll}
                                        disabled={specRows.length === 0}
                                    />
                                </th>
                                <th>Выдано</th>
                                <th>Обозначение</th>
                                <th>Наименование</th>
                                <th>ТИП</th>
                                <th>Требуется</th>
                            </tr>
                        </thead>
                        <tbody>
                            {specRows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="production-order-empty-row">
                                        Выберите заказ и номенклатуру, затем загрузите спецификацию.
                                    </td>
                                </tr>
                            ) : (
                                specRows.map((row) => (
                                    <tr key={row.id} className={checkedRows[row.id] ? 'is-checked' : ''}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(checkedRows[row.id])}
                                                onChange={() => handleToggleRow(row.id)}
                                            />
                                        </td>
                                        <td>{row.issued}</td>
                                        <td>{row.designation}</td>
                                        <td>{row.name}</td>
                                        <td>{row.type}</td>
                                        <td>{row.required}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default IssueOrderWorkspace;
