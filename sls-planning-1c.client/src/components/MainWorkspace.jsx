import React from 'react';
import Settings from './Settings';

const MainWorkspace = ({ isSettingsOpen, user, setUser, setIsSettingsOpen, activeTab, currentSubMenu, activeSubItem }) => {
    if (isSettingsOpen) {
        return <Settings user={user} setUser={setUser} setIsSettingsOpen={setIsSettingsOpen} />;
    }

    return (
        <div className="empty-state">
            {activeTab === 7 ? (
                <p>Выводится дашборд</p>
            ) : currentSubMenu.length > 0 ? (
                <p>{currentSubMenu[activeSubItem]}</p>
            ) : (
                <p>Контент раздела находится в разработке</p>
            )}
        </div>
    );
};

export default MainWorkspace;
