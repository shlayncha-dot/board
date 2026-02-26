import React, { useState } from 'react';
import './App.css';
import LoginScreen from './components/LoginScreen';
import HeaderBar from './components/HeaderBar';
import SubMenuSidebar from './components/SubMenuSidebar';
import MainWorkspace from './components/MainWorkspace';
import { menuConfig } from './config/menuConfig';

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(true);
    const [activeTab, setActiveTab] = useState(0);
    const [activeSubItem, setActiveSubItem] = useState(0);
    const [lang, setLang] = useState('RU');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const [user, setUser] = useState({
        firstName: 'Anna',
        lastName: 'Smith',
        phone: '+380 99 123 45 67',
        email: 'anna.smith@sls.com',
        avatar: 'https://i.pravatar.cc/100?img=32'
    });

    const menuItems = menuConfig.map((item) => item.label);
    const currentSubMenu = menuConfig[activeTab].subMenu;

    const savedUsers = [
        { name: 'Anna Smith', avatar: 'https://i.pravatar.cc/100?img=32' },
        { name: 'John Doe', avatar: 'https://i.pravatar.cc/100?img=12' }
    ];

    const openTab = (index) => {
        setActiveTab(index);
        setActiveSubItem(0);
        setIsSettingsOpen(false);
    };

    const openSubMenuItem = (item, index) => {
        setActiveSubItem(index);

        if (item.startsWith('Настройк')) {
            setIsSettingsOpen(true);
            return;
        }

        setIsSettingsOpen(false);
    };

    if (!isLoggedIn) {
        return <LoginScreen savedUsers={savedUsers} setIsLoggedIn={setIsLoggedIn} />;
    }

    return (
        <div className="main-layout">
            <HeaderBar
                lang={lang}
                setLang={setLang}
                user={user}
                showUserMenu={showUserMenu}
                setShowUserMenu={setShowUserMenu}
                setIsSettingsOpen={setIsSettingsOpen}
                setIsLoggedIn={setIsLoggedIn}
            />

            <nav className="top-nav-container">
                <div className="top-nav-grid">
                    {menuItems.map((item, index) => (
                        <div key={index} className={`nav-column ${activeTab === index ? 'active' : ''}`} onClick={() => openTab(index)}>
                            <div className="nav-circle">
                                <img src={`/images/menu/${index + 1}.png`} alt={item} className="menu-icon-img" />
                            </div>
                            <span className="nav-label">{item}</span>
                        </div>
                    ))}
                </div>
            </nav>

            <div className="workspace">
                {!isSettingsOpen && (
                    <SubMenuSidebar
                        currentSubMenu={currentSubMenu}
                        activeSubItem={activeSubItem}
                        onSubMenuClick={openSubMenuItem}
                    />
                )}

                <main className="main-display">
                    <MainWorkspace
                        isSettingsOpen={isSettingsOpen}
                        user={user}
                        setUser={setUser}
                        setIsSettingsOpen={setIsSettingsOpen}
                        activeTab={activeTab}
                        currentSubMenu={currentSubMenu}
                        activeSubItem={activeSubItem}
                    />
                </main>
            </div>
        </div>
    );
}

export default App;
