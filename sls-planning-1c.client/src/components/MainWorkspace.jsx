import React from 'react';
import Settings from './Settings';
import DashboardWorkspace from './DashboardWorkspace';
import { t } from '../config/translations';

const MainWorkspace = ({ lang, settingsContext, user, setUser, closeAccountSettings, activeTab, currentSubMenu, activeSubItem }) => {
    if (settingsContext === 'account') {
        return <Settings lang={lang} user={user} setUser={setUser} setIsSettingsOpen={closeAccountSettings} />;
    }

    if (activeTab === 7) {
        return <DashboardWorkspace lang={lang} />;
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
