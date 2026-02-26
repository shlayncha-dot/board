import React from 'react';
import { t } from '../config/translations';

const tableHeaderKeys = ['dashboard.order', 'dashboard.status', 'dashboard.section', 'dashboard.deadline'];

const DashboardSection = ({ title, lang }) => {
    return (
        <section className="dashboard-section">
            <h2 className="dashboard-section-title">{title}</h2>

            <div className="dashboard-section-grid">
                <div className="dashboard-table-wrap">
                    <table className="dashboard-table">
                        <thead>
                            <tr>
                                {tableHeaderKeys.map((headerKey) => (
                                    <th key={headerKey}>{t(lang, headerKey)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colSpan={tableHeaderKeys.length} className="dashboard-empty-row">{t(lang, 'dashboard.noData')}</td>
                            </tr>
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
