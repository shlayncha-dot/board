import React from 'react';

const DesignDocsSettingsView = ({
    verificationParams,
    onVerificationParamChange,
    specificationSettings,
    onSpecificationSettingChange,
    onSave,
    onCancel,
}) => {
    return (
        <section className="design-docs-page design-docs-settings-page">
            <div className="settings-horizontal-group specification-group">
                <h2>Настройки Спецификации</h2>
                <div className="specification-grid">
                    <label>
                        <span>Столбцы</span>
                        <textarea
                            rows={25}
                            value={specificationSettings.columns}
                            onChange={(event) => onSpecificationSettingChange('columns', event.target.value)}
                        />
                    </label>
                    <label>
                        <span>ТИП</span>
                        <textarea
                            rows={25}
                            value={specificationSettings.type}
                            onChange={(event) => onSpecificationSettingChange('type', event.target.value)}
                        />
                    </label>
                    <label>
                        <span>Покрытие</span>
                        <textarea
                            rows={25}
                            value={specificationSettings.coverage}
                            onChange={(event) => onSpecificationSettingChange('coverage', event.target.value)}
                        />
                    </label>
                    <label>
                        <span>Грунтовка</span>
                        <textarea
                            rows={25}
                            value={specificationSettings.primer}
                            onChange={(event) => onSpecificationSettingChange('primer', event.target.value)}
                        />
                    </label>
                </div>
            </div>

            <div className="settings-horizontal-group verification-group">
                <h2>Параметры верификации</h2>
                <div className="verification-matrix">
                    <div className="verification-matrix-head" />
                    <div className="verification-matrix-head">Описание</div>
                    <div className="verification-matrix-head">Условие</div>

                    {verificationParams.map((row, index) => (
                        <React.Fragment key={row.type}>
                            <div className="verification-type-label">ТИП {index + 1}</div>
                            <textarea
                                rows={5}
                                value={row.description}
                                onChange={(event) => onVerificationParamChange(index, 'description', event.target.value)}
                            />
                            <textarea
                                rows={5}
                                value={row.condition}
                                onChange={(event) => onVerificationParamChange(index, 'condition', event.target.value)}
                            />
                        </React.Fragment>
                    ))}
                </div>
            </div>

            <div className="settings-horizontal-group specification-group">
                <h2>Link Server</h2>
                <div className="specification-grid">
                    <label>
                        <span>Адрес к файлам (UNC \\server\share или HTTP/HTTPS)</span>
                        <input
                            type="text"
                            value={specificationSettings.linkServer}
                            onChange={(event) => onSpecificationSettingChange('linkServer', event.target.value)}
                            placeholder={"\\192.168.1.193\\PilotGroup  или  http://192.168.1.193:5001"}
                        />
                    </label>
                </div>
            </div>

            <div className="design-docs-actions">
                <button type="button" className="save-btn" onClick={onSave}>Сохранить</button>
                <button type="button" className="cancel-btn" onClick={onCancel}>Отмена</button>
            </div>

        </section>
    );
};

export default DesignDocsSettingsView;
