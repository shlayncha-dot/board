import React from 'react';
import Settings from './Settings';
import DashboardWorkspace from './DashboardWorkspace';
import DesignDocsWorkspace from './DesignDocsWorkspace';
import AdminSettings from './AdminSettings';
import { t } from '../config/translations';
import TechnologistRouteSheetSettings from './TechnologistRouteSheetSettings';
import TechnologistRouteSheetsWorkspace from './TechnologistRouteSheetsWorkspace';

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
        return <DesignDocsWorkspace activeSubItem={activeSubItem} />;
    }

    if (activeTab === 1 && activeSubItem === 0 && settingsContext === 'none') {
        return <TechnologistRouteSheetsWorkspace />;
    }

    if (activeTab === 1 && activeSubItem === 2 && settingsContext === 'none') {
        return <TechnologistRouteSheetSettings />;
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
