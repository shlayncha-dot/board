import React, { useEffect, useMemo, useState } from 'react';
import { getRouteSheetSettings } from '../services/technologistRouteSheetService';

const specificationCatalog = {
    'Проект А': {
        'Спецификация 001': [
            { position: '1', name: 'Корпус', quantity: '2', unit: 'шт' },
            { position: '2', name: 'Рама', quantity: '1', unit: 'шт' },
            { position: '3', name: 'Кронштейн', quantity: '4', unit: 'шт' }
        ],
        'Спецификация 002': [
            { position: '1', name: 'Панель', quantity: '3', unit: 'шт' },
            { position: '2', name: 'Профиль', quantity: '8', unit: 'шт' }
        ]
    },
    'Проект B': {
        'Спецификация 101': [
            { position: '1', name: 'Опора', quantity: '6', unit: 'шт' },
            { position: '2', name: 'Пластина', quantity: '6', unit: 'шт' },
            { position: '3', name: 'Втулка', quantity: '6', unit: 'шт' },
            { position: '4', name: 'Шайба', quantity: '12', unit: 'шт' }
        ]
    }
};

const toLines = (text) => {
    return (text || '')
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
};

const toSectionDetails = (settings, sectionName) => {
    if (!sectionName) {
        return { equipment: [], parameters: [], qc: [] };
    }

    const exact = settings.sectionDetailsByName?.[sectionName];
    const byCaseInsensitiveKey = exact
        ?? Object.entries(settings.sectionDetailsByName || {}).find(([key]) => key.toLowerCase() === sectionName.toLowerCase())?.[1]
        ?? { equipmentText: settings.equipmentText || '', parametersText: '', qcText: '' };

    return {
        equipment: toLines(byCaseInsensitiveKey.equipmentText),
        parameters: toLines(byCaseInsensitiveKey.parametersText),
        qc: toLines(byCaseInsensitiveKey.qcText)
    };
};

const buildStepItems = () => Array.from({ length: 12 }, (_, index) => index + 1);

const TechnologistRouteSheetsWorkspace = () => {
    const currentStep = 1;
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedSpecification, setSelectedSpecification] = useState('');
    const [appliedProject, setAppliedProject] = useState('');
    const [appliedSpecification, setAppliedSpecification] = useState('');

    const [settingsData, setSettingsData] = useState({
        sectionsText: '',
        equipmentText: '',
        selectedSection: '',
        sectionDetailsByName: {}
    });
    const [selectedSopSection, setSelectedSopSection] = useState('');
    const [loadError, setLoadError] = useState('');

    const projectOptions = Object.keys(specificationCatalog);
    const specificationOptions = useMemo(() => {
        if (!selectedProject) {
            return [];
        }

        return Object.keys(specificationCatalog[selectedProject] || {});
    }, [selectedProject]);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const data = await getRouteSheetSettings();
                const normalized = {
                    sectionsText: data?.sectionsText || '',
                    equipmentText: data?.equipmentText || '',
                    selectedSection: data?.selectedSection || '',
                    sectionDetailsByName: data?.sectionDetailsByName || {}
                };

                setSettingsData(normalized);

                const sections = toLines(normalized.sectionsText);
                const firstSection = sections[0] || '';
                const preferred = sections.find((value) => value.toLowerCase() === normalized.selectedSection.toLowerCase()) || firstSection;
                setSelectedSopSection(preferred);
            } catch (error) {
                setLoadError(error.message || 'Не удалось загрузить настройки маршрутного листа.');
            }
        };

        loadSettings();
    }, []);

    const sectionOptions = useMemo(() => toLines(settingsData.sectionsText), [settingsData.sectionsText]);
    const effectiveSelectedSopSection = sectionOptions.some((section) => section.toLowerCase() === selectedSopSection.toLowerCase())
        ? selectedSopSection
        : (sectionOptions[0] || '');


    const sectionDetails = useMemo(() => toSectionDetails(settingsData, effectiveSelectedSopSection), [settingsData, effectiveSelectedSopSection]);
    const equipmentOptions = sectionDetails.equipment;

    const activeSpecificationRows = useMemo(() => {
        if (!appliedProject || !appliedSpecification) {
            return [];
        }

        return specificationCatalog[appliedProject]?.[appliedSpecification] || [];
    }, [appliedProject, appliedSpecification]);

    const openDialog = () => {
        setSelectedProject(appliedProject || projectOptions[0] || '');
        const initialProject = appliedProject || projectOptions[0] || '';
        const initialSpecs = Object.keys(specificationCatalog[initialProject] || {});
        setSelectedSpecification(appliedSpecification || initialSpecs[0] || '');
        setIsDialogOpen(true);
    };

    const closeDialog = () => {
        setIsDialogOpen(false);
    };

    const onProjectChange = (event) => {
        const nextProject = event.target.value;
        setSelectedProject(nextProject);
        const specs = Object.keys(specificationCatalog[nextProject] || {});
        setSelectedSpecification(specs[0] || '');
    };

    const applySpecification = () => {
        if (!selectedProject || !selectedSpecification) {
            return;
        }

        setAppliedProject(selectedProject);
        setAppliedSpecification(selectedSpecification);
        setIsDialogOpen(false);
    };

    return (
        <div className="route-sheets-page">
            <div className="route-sheets-topbar">
                <button type="button" className="save-btn" onClick={openDialog}>Загрузить спецификацию</button>
            </div>

            <div className="route-sheets-main-grid">
                <section className="route-sheets-spec-area">
                    <div className="route-sheets-panel-title">
                        {appliedProject && appliedSpecification
                            ? `${appliedProject} / ${appliedSpecification}`
                            : 'Спецификация не выбрана'}
                    </div>

                    <div className="route-sheets-table-wrap">
                        <table className="route-sheets-table">
                            <thead>
                                <tr>
                                    <th>Позиция</th>
                                    <th>Наименование</th>
                                    <th>Кол-во</th>
                                    <th>Ед.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeSpecificationRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="route-sheets-empty-cell">Выберите проект и спецификацию через кнопку «Загрузить спецификацию».</td>
                                    </tr>
                                ) : activeSpecificationRows.map((row) => (
                                    <tr key={`${row.position}-${row.name}`}>
                                        <td>{row.position}</td>
                                        <td>{row.name}</td>
                                        <td>{row.quantity}</td>
                                        <td>{row.unit}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <aside className="route-sheets-sop-area">
                    <h3>СОП</h3>

                    <fieldset className="sop-step-list" aria-label="Step list">
                        <legend>Step</legend>
                        {buildStepItems().map((stepNumber) => (
                            <label key={stepNumber} className="sop-static-radio-item">
                                <input type="radio" checked={stepNumber === currentStep} disabled tabIndex={-1} />
                                <span>{stepNumber}</span>
                            </label>
                        ))}
                    </fieldset>

                    <div className="sop-settings-grid">
                        <div className="sop-settings-column">
                            <h4>Секции</h4>
                            <div className="sop-options-list">
                                {sectionOptions.length === 0 ? (
                                    <p className="sop-empty-note">Нет данных в настройках маршрутного листа.</p>
                                ) : sectionOptions.map((sectionName) => (
                                    <label key={sectionName} className="sop-option-row">
                                        <input
                                            type="radio"
                                            name="sop-sections"
                                            value={sectionName}
                                            checked={effectiveSelectedSopSection.toLowerCase() === sectionName.toLowerCase()}
                                            onChange={() => setSelectedSopSection(sectionName)}
                                        />
                                        <span>{sectionName}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="sop-settings-column">
                            <h4>Оборудование/Технология</h4>
                            <div className="sop-options-list">
                                {equipmentOptions.length === 0 ? (
                                    <p className="sop-empty-note">Нет данных в настройках маршрутного листа.</p>
                                ) : equipmentOptions.map((item, index) => (
                                    <label key={`${item}-${index}`} className="sop-option-row">
                                        <input type="checkbox" checked readOnly tabIndex={-1} />
                                        <span>{item}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="sop-settings-column">
                            <h4>Параметры</h4>
                            <div className="sop-options-list">
                                {sectionDetails.parameters.length === 0 ? (
                                    <p className="sop-empty-note">Нет параметров для выбранной секции.</p>
                                ) : sectionDetails.parameters.map((item, index) => (
                                    <label key={`${item}-${index}`} className="sop-option-row">
                                        <input type="checkbox" checked readOnly tabIndex={-1} />
                                        <span>{item}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="sop-settings-column">
                            <h4>QC</h4>
                            <div className="sop-options-list">
                                {sectionDetails.qc.length === 0 ? (
                                    <p className="sop-empty-note">Нет QC для выбранной секции.</p>
                                ) : sectionDetails.qc.map((item, index) => (
                                    <label key={`${item}-${index}`} className="sop-option-row">
                                        <input type="checkbox" checked readOnly tabIndex={-1} />
                                        <span>{item}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {loadError && <p className="form-error">{loadError}</p>}
                </aside>
            </div>

            {isDialogOpen && (
                <div className="route-sheets-dialog-overlay" role="presentation">
                    <div className="route-sheets-dialog" role="dialog" aria-modal="true" aria-label="Загрузить спецификацию">
                        <h3>Загрузить спецификацию</h3>

                        <label>
                            Поле выбора проекта
                            <select value={selectedProject} onChange={onProjectChange}>
                                {projectOptions.map((projectName) => (
                                    <option key={projectName} value={projectName}>{projectName}</option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Поле выбора спецификации
                            <select value={selectedSpecification} onChange={(event) => setSelectedSpecification(event.target.value)}>
                                {specificationOptions.map((specificationName) => (
                                    <option key={specificationName} value={specificationName}>{specificationName}</option>
                                ))}
                            </select>
                        </label>

                        <div className="route-sheets-dialog-actions">
                            <button type="button" className="save-btn" onClick={applySpecification}>Сохранить</button>
                            <button type="button" className="cancel-btn" onClick={closeDialog}>Отмена</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TechnologistRouteSheetsWorkspace;
