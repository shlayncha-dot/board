import React from 'react';

const tableHeaders = ['Наряд', 'Статус', 'Участок', 'Срок'];

const DashboardSection = ({ title }) => {
    return (
        <section className="dashboard-section">
            <h2 className="dashboard-section-title">{title}</h2>

            <div className="dashboard-section-grid">
                <div className="dashboard-table-wrap">
                    <table className="dashboard-table">
                        <thead>
                            <tr>
                                {tableHeaders.map((header) => (
                                    <th key={header}>{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colSpan={tableHeaders.length} className="dashboard-empty-row">Нет данных</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <aside className="dashboard-stats">
                    <h3>Statistics</h3>
                </aside>
            </div>
        </section>
    );
};

const DashboardWorkspace = () => {
    return (
        <div className="dashboard-workspace">
            <DashboardSection title="Metalworking" />
            <DashboardSection title="Assembly" />
        </div>
    );
};

export default DashboardWorkspace;
