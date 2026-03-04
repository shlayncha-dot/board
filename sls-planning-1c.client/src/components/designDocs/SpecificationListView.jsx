import React, { useMemo, useState } from 'react';

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

const getSearchableValue = (specification) => [
    specification.specificationName,
    specification.specType,
    specification.specificationCode,
    specification.originalFileName,
    specification.uploadedBy,
    specification.comment,
    specification.uploadedAtUtc,
    specification.oneCSyncStatus,
]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ');

const SpecificationListView = ({
    specifications,
    isLoading,
    loadError
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filteredSpecifications = useMemo(() => {
        if (!normalizedSearch) {
            return specifications;
        }

        return specifications.filter((specification) => getSearchableValue(specification).includes(normalizedSearch));
    }, [normalizedSearch, specifications]);

    return (
        <section className="design-docs-page spec-list-page">
            <article className="spec-card spec-list-card">
                <h2>Список спецификаций</h2>

                <label className="field-group spec-list-search-field">
                    Поиск по таблице
                    <input
                        type="search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Поиск по всем колонкам"
                    />
                </label>

                {loadError ? <p className="spec-list-error">{loadError}</p> : null}

                <div className="spec-list-table-wrap">
                    <table className="spec-list-table">
                        <thead>
                            <tr>
                                <th>Наименование спецификации</th>
                                <th>Тип спецификации</th>
                                <th>Код спецификации</th>
                                <th>Имя файла</th>
                                <th>Загрузил</th>
                                <th>Комментарий</th>
                                <th>Дата загрузки (UTC)</th>
                                <th>Статус синхронизации 1C</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8}>Загрузка...</td>
                                </tr>
                            ) : filteredSpecifications.length === 0 ? (
                                <tr>
                                    <td colSpan={8}>{normalizedSearch ? 'Поиск не дал результатов.' : 'Список спецификаций пуст.'}</td>
                                </tr>
                            ) : (
                                filteredSpecifications.map((specification) => (
                                    <tr key={specification.id}>
                                        <td>{specification.specificationName || '—'}</td>
                                        <td>{specification.specType || '—'}</td>
                                        <td>{specification.specificationCode || '—'}</td>
                                        <td>{specification.originalFileName || '—'}</td>
                                        <td>{specification.uploadedBy || '—'}</td>
                                        <td>{specification.comment || '—'}</td>
                                        <td>{formatDateTime(specification.uploadedAtUtc)}</td>
                                        <td>{specification.oneCSyncStatus || '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </article>
        </section>
    );
};

export default SpecificationListView;
