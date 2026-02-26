import React from 'react';
import { t } from '../config/translations';

const defaultTableHeaderKeys = ['dashboard.order', 'dashboard.status', 'dashboard.section', 'dashboard.deadline'];
const minVisibleRows = 10;

const metalworkingColumns = [
    'Проект',
    'Наряд',
    'Кол.',
    'Лазер',
    'Гибка',
    'ОТК',
    'Сварка',
    'ОТК',
    'Подсборка',
    'ОТК',
    'Покраска',
    'ОТК',
    'Market',
    'Data'
];

const metalworkingRow = [
    'Fermopint',
    'FM_Baldahin',
    '34',
    'Готово',
    '65%',
    'Ожидает',
    'Ожидает',
    'Ожидает',
    'Ожидает',
    'Ожидает',
    'Ожидает',
    'Ожидает',
    'Ожидает',
    'Ожидает'
];

const renderMetalworkingCell = (value, rowIndex, colIndex) => {
    const cellKey = `metal-cell-${rowIndex}-${colIndex}`;

    if (value === 'Готово') {
        return (
            <span key={cellKey} className="status-chip status-chip--done">
                {value}
            </span>
        );
    }

    if (value === 'Ожидает') {
        return (
            <span key={cellKey} className="status-chip status-chip--waiting">
                {value}
            </span>
        );
    }

    if (value.endsWith('%')) {
        const percent = Number.parseInt(value, 10) || 0;

        return (
            <div key={cellKey} className="percent-bar" role="img" aria-label={`Готовность ${value}`}>
                <div className="percent-bar-fill" style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }} />
                <span className="percent-bar-value">{value}</span>
            </div>
        );
    }

    return value;
};

const DashboardSection = ({ title, lang, variant = 'default' }) => {
    const isMetalworking = variant === 'metalworking';

    return (
        <section className="dashboard-section">
            <h2 className="dashboard-section-title">{title}</h2>

            <div className={`dashboard-section-grid ${isMetalworking ? 'dashboard-section-grid--metalworking' : ''}`}>
                <div className="dashboard-table-wrap">
                    <table className={`dashboard-table ${isMetalworking ? 'dashboard-table--metalworking' : ''}`}>
                        <thead>
                            <tr>
                                {isMetalworking
                                    ? metalworkingColumns.map((columnName, columnIndex) => (
                                        <th key={`metal-header-${columnName}-${columnIndex}`}>{columnName}</th>
                                    ))
                                    : (
                                        <>
                                            <th className="dashboard-row-number-col">№</th>
                                            {defaultTableHeaderKeys.map((headerKey) => (
                                                <th key={headerKey}>{t(lang, headerKey)}</th>
                                            ))}
                                        </>
                                    )}
                            </tr>
                        </thead>
                        <tbody>
                            {isMetalworking
                                ? (
                                    <tr>
                                        {metalworkingRow.map((value, columnIndex) => (
                                            <td key={`metal-row-0-cell-${columnIndex}`}>
                                                {renderMetalworkingCell(value, 0, columnIndex)}
                                            </td>
                                        ))}
                                    </tr>
                                )
                                : Array.from({ length: minVisibleRows }, (_, rowIndex) => (
                                    <tr key={`empty-row-${rowIndex}`}>
                                        <td className="dashboard-row-number-col">{rowIndex + 1}</td>
                                        {defaultTableHeaderKeys.map((headerKey) => (
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
            <DashboardSection lang={lang} title={t(lang, 'dashboard.metalworking')} variant="metalworking" />
            <DashboardSection lang={lang} title={t(lang, 'dashboard.assembly')} />
        </div>
    );
};

export default DashboardWorkspace;
