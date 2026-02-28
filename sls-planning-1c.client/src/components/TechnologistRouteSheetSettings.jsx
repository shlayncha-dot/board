import React, { useEffect, useMemo, useState } from 'react';
import { getRouteSheetSettings, saveRouteSheetSettings } from '../services/technologistRouteSheetService';

const splitSections = (rawText) => {
    return rawText
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
        .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
};

const buildEmptyDetails = () => ({ equipmentText: '', parametersText: '', qcText: '' });

const normalizeResponseDetails = (detailsByName, fallbackEquipmentText = '') => {
    const normalized = {};

    if (!detailsByName || typeof detailsByName !== 'object') {
        return normalized;
    }

    Object.entries(detailsByName).forEach(([key, value]) => {
        normalized[key] = {
            equipmentText: value?.equipmentText ?? fallbackEquipmentText,
            parametersText: value?.parametersText ?? '',
            qcText: value?.qcText ?? ''
        };
    });

    return normalized;
};

const TechnologistRouteSheetSettings = () => {
    const [sectionsText, setSectionsText] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [detailsBySection, setDetailsBySection] = useState({});
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const sectionOptions = useMemo(() => splitSections(sectionsText), [sectionsText]);

    useEffect(() => {
        const loadSettings = async () => {
            setIsLoading(true);
            setError('');

            try {
                const data = await getRouteSheetSettings();
                const nextSectionsText = data?.sectionsText ?? '';
                const nextSectionOptions = splitSections(nextSectionsText);
                const nextSelected = nextSectionOptions.find((option) => option.toLowerCase() === (data?.selectedSection ?? '').toLowerCase()) ?? nextSectionOptions[0] ?? '';

                setSectionsText(nextSectionsText);
                setSelectedSection(nextSelected);
                setDetailsBySection(normalizeResponseDetails(data?.sectionDetailsByName, data?.equipmentText ?? ''));
            } catch (loadError) {
                setError(loadError.message || 'Не удалось загрузить настройки.');
            } finally {
                setIsLoading(false);
            }
        };

        loadSettings();
    }, []);

    useEffect(() => {
        if (sectionOptions.length === 0) {
            setSelectedSection('');
            return;
        }

        const exists = sectionOptions.some((option) => option.toLowerCase() === selectedSection.toLowerCase());
        if (!exists) {
            setSelectedSection(sectionOptions[0]);
        }
    }, [sectionOptions, selectedSection]);

    useEffect(() => {
        if (!selectedSection) {
            return;
        }

        setDetailsBySection((previous) => {
            if (previous[selectedSection]) {
                return previous;
            }

            return {
                ...previous,
                [selectedSection]: buildEmptyDetails()
            };
        });
    }, [selectedSection]);

    const currentDetails = selectedSection ? detailsBySection[selectedSection] ?? buildEmptyDetails() : buildEmptyDetails();

    const onSectionsChange = (event) => {
        setSectionsText(event.target.value);
        setMessage('');
        setError('');
    };

    const onUpdateCurrentDetails = (fieldName, value) => {
        if (!selectedSection) {
            return;
        }

        setDetailsBySection((previous) => ({
            ...previous,
            [selectedSection]: {
                ...(previous[selectedSection] ?? buildEmptyDetails()),
                [fieldName]: value
            }
        }));
        setMessage('');
        setError('');
    };

    const onSave = async () => {
        setIsSaving(true);
        setError('');
        setMessage('');

        const payload = {
            sectionsText,
            selectedSection,
            sectionDetailsByName: detailsBySection
        };

        try {
            const saved = await saveRouteSheetSettings(payload);
            const nextSectionsText = saved?.sectionsText ?? sectionsText;
            const nextSectionOptions = splitSections(nextSectionsText);
            const nextSelected = nextSectionOptions.find((option) => option.toLowerCase() === (saved?.selectedSection ?? '').toLowerCase()) ?? nextSectionOptions[0] ?? '';

            setSectionsText(nextSectionsText);
            setSelectedSection(nextSelected);
            setDetailsBySection(normalizeResponseDetails(saved?.sectionDetailsByName, saved?.equipmentText ?? ''));
            setMessage('Настройки маршрутного листа сохранены.');
        } catch (saveError) {
            setError(saveError.message || 'Ошибка сохранения.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="tech-route-settings">
            <h2>Настройка Маршрутного листа</h2>

            {isLoading ? (
                <p>Загрузка...</p>
            ) : (
                <>
                    <div className="tech-route-grid">
                        <div className="tech-route-column">
                            <label htmlFor="sections-text">Секции</label>
                            <textarea id="sections-text" rows={15} value={sectionsText} onChange={onSectionsChange} />
                        </div>

                        <div className="tech-route-column">
                            <label>Секции</label>
                            <div className="tech-route-radio-list" role="radiogroup" aria-label="Секции">
                                {sectionOptions.length === 0 ? (
                                    <p className="tech-route-placeholder">Добавьте секции по одной строке.</p>
                                ) : sectionOptions.map((option) => (
                                    <label key={option} className="tech-route-radio-item">
                                        <input
                                            type="radio"
                                            name="sections-radio"
                                            value={option}
                                            checked={selectedSection.toLowerCase() === option.toLowerCase()}
                                            onChange={() => setSelectedSection(option)}
                                        />
                                        <span>{option}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="tech-route-column">
                            <label htmlFor="equipment-text">Оборудование</label>
                            <textarea
                                id="equipment-text"
                                rows={15}
                                value={currentDetails.equipmentText}
                                onChange={(event) => onUpdateCurrentDetails('equipmentText', event.target.value)}
                                disabled={!selectedSection}
                            />
                        </div>

                        <div className="tech-route-column">
                            <label htmlFor="parameters-text">Параметры</label>
                            <textarea
                                id="parameters-text"
                                rows={15}
                                value={currentDetails.parametersText}
                                onChange={(event) => onUpdateCurrentDetails('parametersText', event.target.value)}
                                disabled={!selectedSection}
                            />
                        </div>

                        <div className="tech-route-column">
                            <label htmlFor="qc-text">QC</label>
                            <textarea
                                id="qc-text"
                                rows={15}
                                value={currentDetails.qcText}
                                onChange={(event) => onUpdateCurrentDetails('qcText', event.target.value)}
                                disabled={!selectedSection}
                            />
                        </div>
                    </div>

                    <div className="tech-route-actions">
                        <button className="save-btn" type="button" disabled={isSaving} onClick={onSave}>
                            {isSaving ? 'Сохранение...' : 'Сохранить'}
                        </button>
                    </div>
                </>
            )}

            {message && <p className="form-success">{message}</p>}
            {error && <p className="form-error">{error}</p>}
        </div>
    );
};

export default TechnologistRouteSheetSettings;
