import React, { useMemo, useState } from 'react';
import { t } from '../config/translations';

const createDefaultItem = () => ({
    name: '',
    quantity: '',
    dueDate: ''
});

const ProductionOrderWorkspace = ({ lang }) => {
    const [orderName, setOrderName] = useState('');
    const [items, setItems] = useState([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newItem, setNewItem] = useState(createDefaultItem());

    const summaryRows = useMemo(() => {
        const summaryMap = new Map();

        items.forEach(({ name, quantity }) => {
            const normalizedName = name.trim();
            const parsedQuantity = Number(quantity) || 0;

            if (!summaryMap.has(normalizedName)) {
                summaryMap.set(normalizedName, 0);
            }

            summaryMap.set(normalizedName, summaryMap.get(normalizedName) + parsedQuantity);
        });

        return Array.from(summaryMap.entries()).map(([name, quantity]) => ({ name, quantity }));
    }, [items]);

    const handleAddItem = () => {
        const trimmedName = newItem.name.trim();
        const parsedQuantity = Number(newItem.quantity);

        if (!trimmedName || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !newItem.dueDate) {
            return;
        }

        setItems((prev) => [
            ...prev,
            {
                id: Date.now(),
                name: trimmedName,
                quantity: parsedQuantity,
                dueDate: newItem.dueDate
            }
        ]);
        setNewItem(createDefaultItem());
        setIsDialogOpen(false);
    };

    const handleCancel = () => {
        setOrderName('');
        setItems([]);
        setNewItem(createDefaultItem());
        setIsDialogOpen(false);
    };

    return (
        <div className="production-order-workspace">
            <h2>{t(lang, 'productionOrder.title')}</h2>

            <label className="production-order-field">
                <span>{t(lang, 'productionOrder.orderName')}</span>
                <input
                    type="text"
                    value={orderName}
                    onChange={(event) => setOrderName(event.target.value)}
                    placeholder={t(lang, 'productionOrder.orderNamePlaceholder')}
                />
            </label>

            <div className="production-order-table-block">
                <div className="production-order-table-header">
                    <h3>{t(lang, 'productionOrder.items')}</h3>
                    <button className="production-order-add-btn" onClick={() => setIsDialogOpen(true)}>
                        {t(lang, 'productionOrder.addNomenclature')}
                    </button>
                </div>

                <div className="production-order-table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>{t(lang, 'productionOrder.nomenclature')}</th>
                                <th>{t(lang, 'productionOrder.quantity')}</th>
                                <th>{t(lang, 'productionOrder.dueDate')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="production-order-empty-row">
                                        {t(lang, 'productionOrder.noItems')}
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.name}</td>
                                        <td>{item.quantity}</td>
                                        <td>{item.dueDate}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="production-order-table-block">
                <h3>{`${t(lang, 'productionOrder.summary')}: ${items.length}`}</h3>
                <div className="production-order-table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>{t(lang, 'productionOrder.nomenclature')}</th>
                                <th>{t(lang, 'productionOrder.quantity')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summaryRows.length === 0 ? (
                                <tr>
                                    <td colSpan={2} className="production-order-empty-row">
                                        {t(lang, 'productionOrder.noSummary')}
                                    </td>
                                </tr>
                            ) : (
                                summaryRows.map((row) => (
                                    <tr key={row.name}>
                                        <td>{row.name}</td>
                                        <td>{row.quantity}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="production-order-actions">
                <button className="production-order-create-btn">{t(lang, 'productionOrder.create')}</button>
                <button className="production-order-cancel-btn" onClick={handleCancel}>{t(lang, 'productionOrder.cancel')}</button>
            </div>

            {isDialogOpen ? (
                <div className="production-order-modal-backdrop">
                    <div className="production-order-modal">
                        <h3>{t(lang, 'productionOrder.addDialogTitle')}</h3>

                        <label className="production-order-field">
                            <span>{t(lang, 'productionOrder.nomenclature')}</span>
                            <input
                                type="text"
                                value={newItem.name}
                                onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                            />
                        </label>

                        <label className="production-order-field">
                            <span>{t(lang, 'productionOrder.quantity')}</span>
                            <input
                                type="number"
                                min="1"
                                value={newItem.quantity}
                                onChange={(event) => setNewItem((prev) => ({ ...prev, quantity: event.target.value }))}
                            />
                        </label>

                        <label className="production-order-field">
                            <span>{t(lang, 'productionOrder.dueDate')}</span>
                            <input
                                type="date"
                                value={newItem.dueDate}
                                onChange={(event) => setNewItem((prev) => ({ ...prev, dueDate: event.target.value }))}
                            />
                        </label>

                        <div className="production-order-actions">
                            <button className="production-order-create-btn" onClick={handleAddItem}>{t(lang, 'productionOrder.add')}</button>
                            <button className="production-order-cancel-btn" onClick={() => setIsDialogOpen(false)}>{t(lang, 'productionOrder.cancel')}</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ProductionOrderWorkspace;
