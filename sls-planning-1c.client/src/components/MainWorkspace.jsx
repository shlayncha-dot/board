import React, { useRef, useState } from 'react';
import Settings from './Settings';
import DashboardWorkspace from './DashboardWorkspace';
import DesignDocsWorkspace from './DesignDocsWorkspace';
import AdminSettings from './AdminSettings';
import { t } from '../config/translations';
import TechnologistRouteSheetSettings from './TechnologistRouteSheetSettings';
import TechnologistRouteSheetsWorkspace from './TechnologistRouteSheetsWorkspace';
import SpecificationUploadView from './designDocs/SpecificationUploadView';
import ProductionOrderWorkspace from './ProductionOrderWorkspace';
import IssueOrderWorkspace from './IssueOrderWorkspace';
import AssemblyStagesWorkspace from './AssemblyStagesWorkspace';

const MainWorkspace = ({
    lang,
    settingsContext,
    user,
    setUser,
    closeAccountSettings,
    activeTab,
    currentSubMenu,
    activeSubItem,
    activeAdminSubItem,
    usersList,
    onCreateUser,
    onSaveUserAccess
}) => {
    const techUploadInputRef = useRef(null);
    const [techProductName, setTechProductName] = useState('');
    const [techSpecName, setTechSpecName] = useState('');
    const [techUploadFile, setTechUploadFile] = useState('');

    if (settingsContext === 'account') {
        return <Settings lang={lang} user={user} setUser={setUser} setIsSettingsOpen={closeAccountSettings} />;
    }

    if (settingsContext === 'admin') {
        return (
            <div className="admin-state">
                <AdminSettings
                    usersList={usersList}
                    onCreateUser={onCreateUser}
                    onSaveUserAccess={onSaveUserAccess}
                    activeAdminSubItem={activeAdminSubItem}
                />
            </div>
        );
    }

    if (activeTab === 7) {
        return <DashboardWorkspace lang={lang} />;
    }
    if (activeTab === 0 && settingsContext === 'none') {
        return <DesignDocsWorkspace activeSubItem={activeSubItem} namingLogin={user.login} />;
    }

    if (activeTab === 1 && activeSubItem === 0 && settingsContext === 'none') {
        return <TechnologistRouteSheetsWorkspace />;
    }

    if (activeTab === 1 && activeSubItem === 1 && settingsContext === 'none') {
        return (
            <SpecificationUploadView
                productName={techProductName}
                onProductNameChange={setTechProductName}
                specName={techSpecName}
                onSpecNameChange={setTechSpecName}
                uploadFile={techUploadFile}
                uploadInputRef={techUploadInputRef}
                onUploadFileChange={setTechUploadFile}
            />
        );
    }

    if (activeTab === 1 && activeSubItem === 2 && settingsContext === 'none') {
        return <TechnologistRouteSheetSettings />;
    }

    if (activeTab === 3 && activeSubItem === 0 && settingsContext === 'none') {
        return <ProductionOrderWorkspace lang={lang} />;
    }

    if (activeTab === 5 && activeSubItem === 0 && settingsContext === 'none') {
        return <IssueOrderWorkspace />;
    }

    if (activeTab === 4 && activeSubItem === 2 && settingsContext === 'none') {
        return <AssemblyStagesWorkspace />;
    }

    return (
        <div className="empty-state">
            {currentSubMenu.length > 0 ? (
                <p>{currentSubMenu[activeSubItem]}</p>
            ) : (
                <p>{t(lang, 'common.inDevelopment')}</p>
            )}
        </div>
    );
};

export default MainWorkspace;
