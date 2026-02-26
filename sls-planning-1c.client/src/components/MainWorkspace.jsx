import React from 'react';
import Settings from './Settings';
import DashboardWorkspace from './DashboardWorkspace';

const MainWorkspace = ({ settingsContext, user, setUser, closeAccountSettings, activeTab, currentSubMenu, activeSubItem }) => {
    if (settingsContext === 'account') {
        return <Settings user={user} setUser={setUser} setIsSettingsOpen={closeAccountSettings} />;
    }

    return (
        <div className="empty-state">
            {activeTab === 7 ? (
                <DashboardWorkspace />
            ) : currentSubMenu.length > 0 ? (
                <p>{currentSubMenu[activeSubItem]}</p>
            ) : (
                <p>Контент раздела находится в разработке</p>
            )}
        </div>
    );
};

export default MainWorkspace;
