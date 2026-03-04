import React, { useEffect, useState } from 'react';
import { specificationUploadApi } from '../config/apiConfig';
import { t } from '../config/translations';

const SPEC_TYPES = ['Basic', 'Wire', 'Packaging', 'Tech'];

const createDefaultItem = () => ({
    name: '',
    quantity: '',
    dueDate: ''
});

const createItemSpecifications = () => SPEC_TYPES.reduce((accumulator, type) => {
    accumulator[type] = '';
    return accumulator;
}, {});

const normalizeSpecificationOptions = (data) => {
    const groupedByType = SPEC_TYPES.reduce((accumulator, type) => {
        accumulator[type] = [];
        return accumulator;
    }, {});

    (Array.isArray(data) ? data : []).forEach((record) => {
        const specType = String(record?.specType ?? '').trim();

        if (!SPEC_TYPES.includes(specType)) {
            return;
        }

        groupedByType[specType].push({
            id: String(record?.id ?? ''),
            name: String(record?.specificationName ?? '').trim() || String(record?.specificationCode ?? '').trim() || '—'
        });
    });

    return groupedByType;
};

const ProductionOrderWorkspace = ({ lang }) => {
    const [orderName, setOrderName] = useState('');
    const [items, setItems] = useState([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newItem, setNewItem] = useState(createDefaultItem());
    const [specificationOptionsByType, setSpecificationOptionsByType] = useState(() => normalizeSpecificationOptions([]));
    const [isSpecOptionsLoading, setIsSpecOptionsLoading] = useState(false);
    const [specOptionsError, setSpecOptionsError] = useState('');

    useEffect(() => {
        const controller = new AbortController();

        const loadSpecificationOptions = async () => {
            setIsSpecOptionsLoading(true);
            setSpecOptionsError('');

            try {
                const response = await fetch(specificationUploadApi.specifications, { signal: controller.signal });

                if (!response.ok) {
                    throw new Error(t(lang, 'productionOrder.specLoadError'));
                }

                const data = await response.json();
                setSpecificationOptionsByType(normalizeSpecificationOptions(data));
            } catch (error) {
                if (controller.signal.aborted) {
                    return;
                }

                setSpecificationOptionsByType(normalizeSpecificationOptions([]));
                setSpecOptionsError(error instanceof Error ? error.message : t(lang, 'productionOrder.specLoadError'));
            } finally {
                if (!controller.signal.aborted) {
                    setIsSpecOptionsLoading(false);
                }
            }
        };

        loadSpecificationOptions();

        return () => {
            controller.abort();
        };
    }, [lang]);

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
                dueDate: newItem.dueDate,
                specifications: createItemSpecifications()
            }
        ]);
        setNewItem(createDefaultItem());
        setIsDialogOpen(false);
    };

    const handleSpecificationSelect = (itemId, specType, specId) => {
        setItems((prev) => prev.map((item) => {
            if (item.id !== itemId) {
                return item;
            }

            return {
                ...item,
                specifications: {
                    ...item.specifications,
                    [specType]: specId
                }
            };
        }));
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

            <div className="production-order-top-controls">
                <label className="production-order-field production-order-order-name-field">
                    <span>{t(lang, 'productionOrder.orderName')}</span>
                    <input
                        type="text"
                        value={orderName}
                        onChange={(event) => setOrderName(event.target.value)}
                        placeholder={t(lang, 'productionOrder.orderNamePlaceholder')}
                    />
                </label>
                <button className="production-order-add-btn" onClick={() => setIsDialogOpen(true)}>
                    {t(lang, 'productionOrder.addNomenclature')}
                </button>
            </div>

            <div className="production-order-table-block">
                {isSpecOptionsLoading ? <p className="production-order-status">{t(lang, 'productionOrder.specLoading')}</p> : null}
                {specOptionsError ? <p className="production-order-status production-order-status-error">{specOptionsError}</p> : null}

                <div className="production-order-table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>{t(lang, 'productionOrder.nomenclature')}</th>
                                <th>{t(lang, 'productionOrder.quantity')}</th>
                                <th>{t(lang, 'productionOrder.dueDate')}</th>
                                {SPEC_TYPES.map((type) => (
                                    <th key={type}>{type}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={3 + SPEC_TYPES.length} className="production-order-empty-row">
                                        {t(lang, 'productionOrder.noItems')}
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.name}</td>
                                        <td>{item.quantity}</td>
                                        <td>{item.dueDate}</td>
                                        {SPEC_TYPES.map((type) => {
                                            const options = specificationOptionsByType[type] || [];
                                            const selectedValue = item.specifications?.[type] || '';

                                            return (
                                                <td key={`${item.id}-${type}`}>
                                                    <select
                                                        value={selectedValue}
                                                        onChange={(event) => handleSpecificationSelect(item.id, type, event.target.value)}
                                                    >
                                                        <option value="">{t(lang, 'productionOrder.selectSpecification')}</option>
                                                        {options.map((option) => (
                                                            <option key={option.id} value={option.id}>{option.name}</option>
                                                        ))}
                                                    </select>
                                                    {options.length === 0 ? (
                                                        <div className="production-order-spec-empty">{t(lang, 'productionOrder.noSpecificationsForType')}</div>
                                                    ) : null}
                                                </td>
                                            );
                                        })}
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

                        <div className="production-order-modal-row">
                            <label className="production-order-field production-order-modal-field">
                                <span>{t(lang, 'productionOrder.quantity')}</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={newItem.quantity}
                                    onChange={(event) => setNewItem((prev) => ({ ...prev, quantity: event.target.value }))}
                                />
                            </label>

                            <label className="production-order-field production-order-modal-field">
                                <span>{t(lang, 'productionOrder.dueDate')}</span>
                                <input
                                    type="date"
                                    value={newItem.dueDate}
                                    onChange={(event) => setNewItem((prev) => ({ ...prev, dueDate: event.target.value }))}
                                />
                            </label>
                        </div>

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
