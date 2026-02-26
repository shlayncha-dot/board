import React from 'react';
import { t } from '../config/translations';

const tableHeaderKeys = ['dashboard.order', 'dashboard.status', 'dashboard.section', 'dashboard.deadline'];
const minVisibleRows = 10;

const DashboardSection = ({ title, lang }) => {
    return (
        <section className="dashboard-section">
            <h2 className="dashboard-section-title">{title}</h2>

            <div className="dashboard-section-grid">
                <div className="dashboard-table-wrap">
                    <table className="dashboard-table">
                        <thead>
                            <tr>
                                <th className="dashboard-row-number-col">№</th>
                                {tableHeaderKeys.map((headerKey) => (
                                    <th key={headerKey}>{t(lang, headerKey)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: minVisibleRows }, (_, rowIndex) => (
                                <tr key={`empty-row-${rowIndex}`}>
                                    <td className="dashboard-row-number-col">{rowIndex + 1}</td>
                                    {tableHeaderKeys.map((headerKey) => (
                                        <td key={`${headerKey}-${rowIndex}`} className="dashboard-placeholder-cell" aria-hidden="true">&nbsp;</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <aside className="dashboard-stats">
                    <h3>{t(lang, 'dashboard.stats')}</h3>
                </aside>
            </div>
        </section>
    );
};

const DashboardWorkspace = ({ lang }) => {
    return (
        <div className="dashboard-workspace">
            <DashboardSection lang={lang} title={t(lang, 'dashboard.metalworking')} />
            <DashboardSection lang={lang} title={t(lang, 'dashboard.assembly')} />
        </div>
    );
};

export default DashboardWorkspace;
