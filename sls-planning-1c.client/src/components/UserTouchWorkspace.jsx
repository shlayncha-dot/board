import React, { useEffect, useMemo, useState } from 'react';

const mockOrders = [
    { id: 'N-0001', project: 'Fermopoint', status: 'Открыт', deadline: '2026-03-18' },
    { id: 'N-0002', project: 'Atlas', status: 'В работе', deadline: '2026-03-19' },
    { id: 'N-0003', project: 'Vektor', status: 'Открыт', deadline: '2026-03-19' },
    { id: 'N-0004', project: 'Omega', status: 'В работе', deadline: '2026-03-20' },
    { id: 'N-0005', project: 'Navi', status: 'Открыт', deadline: '2026-03-20' },
    { id: 'N-0006', project: 'Pulse', status: 'Открыт', deadline: '2026-03-21' },
    { id: 'N-0007', project: 'Nova', status: 'В работе', deadline: '2026-03-21' },
    { id: 'N-0008', project: 'Sirius', status: 'Открыт', deadline: '2026-03-22' },
    { id: 'N-0009', project: 'Sigma', status: 'Открыт', deadline: '2026-03-22' },
    { id: 'N-0010', project: 'Stream', status: 'В работе', deadline: '2026-03-23' },
    { id: 'N-0011', project: 'Raptor', status: 'Открыт', deadline: '2026-03-24' },
    { id: 'N-0012', project: 'Prime', status: 'Открыт', deadline: '2026-03-24' }
];

const mockParts = [
    { id: 'D-113', name: 'Кронштейн', qty: 2 },
    { id: 'D-114', name: 'Панель', qty: 6 },
    { id: 'D-115', name: 'Стойка', qty: 2 },
    { id: 'D-116', name: 'Планка', qty: 10 },
    { id: 'D-117', name: 'Опора', qty: 4 }
];

const UserTouchWorkspace = () => {
    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [selectedPart, setSelectedPart] = useState(null);

    const selectedOrder = useMemo(
        () => mockOrders.find((item) => item.id === selectedOrderId) || null,
        [selectedOrderId]
    );

    useEffect(() => {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {
                // Автоматический полноэкранный режим может быть заблокирован браузером.
            });
        }
    }, []);


    return (
        <div className="user-touch-layout">
            <section className="user-touch-main-column">
                <article className="user-touch-card">
                    <header className="user-touch-card-header">
                        <h2>Полуночные наряды</h2>
                        <div className="user-touch-order-actions">
                            <button type="button" className="user-touch-btn user-touch-btn--primary">Взять наряд</button>
                        </div>
                    </header>

                    <div className="user-touch-table-scroller user-touch-table-scroller--orders">
                        <table className="user-touch-table">
                            <thead>
                                <tr>
                                    <th>Наряд</th>
                                    <th>Проект</th>
                                    <th>Статус</th>
                                    <th>Срок</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mockOrders.map((order) => (
                                    <tr
                                        key={order.id}
                                        className={selectedOrderId === order.id ? 'is-selected' : ''}
                                        onClick={() => setSelectedOrderId(order.id)}
                                    >
                                        <td>{order.id}</td>
                                        <td>{order.project}</td>
                                        <td>{order.status}</td>
                                        <td>{order.deadline}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </article>

                <article className="user-touch-card">
                    <header className="user-touch-card-header">
                        <h2>Детали текущего наряда</h2>
                    </header>

                    <div className="user-touch-table-scroller">
                        <table className="user-touch-table">
                            <thead>
                                <tr>
                                    <th>Код</th>
                                    <th>Наименование</th>
                                    <th>Кол-во</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mockParts.map((part) => (
                                    <tr key={part.id} onClick={() => setSelectedPart(part)}>
                                        <td>{part.id}</td>
                                        <td>{part.name}</td>
                                        <td>{part.qty}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </article>
            </section>

            <aside className="user-touch-side-column">
                <article className="user-touch-card user-touch-summary-card">
                    <h2>Данные наряда</h2>
                    {selectedOrder ? (
                        <ul>
                            <li><strong>Наряд:</strong> {selectedOrder.id}</li>
                            <li><strong>Проект:</strong> {selectedOrder.project}</li>
                            <li><strong>Статус:</strong> {selectedOrder.status}</li>
                            <li><strong>Срок:</strong> {selectedOrder.deadline}</li>
                        </ul>
                    ) : (
                        <p>Выберите строку в таблице нарядов.</p>
                    )}
                </article>
            </aside>

            {selectedPart && (
                <div className="user-touch-modal-overlay" role="presentation">
                    <div className="user-touch-modal" role="dialog" aria-modal="true" aria-label="Предпросмотр чертежа">
                        <div className="user-touch-modal-route-data">
                            <h3>Маршрутный лист</h3>
                            <p>Здесь будут данные маршрутного листа для выбранной детали.</p>
                        </div>
                        <div className="user-touch-modal-drawing">
                            <h3>Превью чертежа</h3>
                            <p>Пока только заглушка предпросмотра.</p>
                        </div>
                        <button type="button" className="user-touch-btn user-touch-btn--primary" onClick={() => setSelectedPart(null)}>
                            Закрыть
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserTouchWorkspace;
