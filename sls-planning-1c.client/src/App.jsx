import React, { useMemo, useState } from 'react';
import './App.css';
import LoginScreen from './components/LoginScreen';
import HeaderBar from './components/HeaderBar';
import SubMenuSidebar from './components/SubMenuSidebar';
import MainWorkspace from './components/MainWorkspace';
import DashboardWorkspace from './components/DashboardWorkspace';
import { menuConfig } from './config/menuConfig';

const STORAGE_KEY = 'sls-auth-data';

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(true);
    const [activeTab, setActiveTab] = useState(0);
    const [activeSubItem, setActiveSubItem] = useState(0);
    const [lang, setLang] = useState('RU');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [settingsContext, setSettingsContext] = useState('none');
    const [savedLogin, setSavedLogin] = useState(() => {
        const data = localStorage.getItem(STORAGE_KEY);

        if (!data) {
            return '';
        }

        try {
            const parsedData = JSON.parse(data);
            return parsedData.login || '';
        } catch {
            localStorage.removeItem(STORAGE_KEY);
            return '';
        }
    });

    const [user, setUser] = useState({
        firstName: 'Anna',
        lastName: 'Smith',
        phone: '+380 99 123 45 67',
        email: 'anna.smith@sls.com',
        avatar: 'https://i.pravatar.cc/100?img=32'
    });

    const isDashboardScreenMode = useMemo(() => {
        const pathName = window.location.pathname.toLowerCase();
        return pathName === '/dashboard-screen';
    }, []);

    const menuItems = useMemo(() => menuConfig.map((item) => item.label), []);
    const currentSubMenu = menuConfig[activeTab].subMenu;

    const openTab = (index) => {
        setActiveTab(index);
        setActiveSubItem(0);
        setSettingsContext('none');
    };

    const openSubMenuItem = (_, index) => {
        setActiveSubItem(index);
        setSettingsContext('none');
    };

    const openAccountSettings = () => {
        setSettingsContext('account');
        setShowUserMenu(false);
    };

    const logout = () => {
        setIsLoggedIn(false);
        setShowUserMenu(false);
        setSettingsContext('none');
    };

    const login = ({ login: loginName, rememberMe }) => {
        setIsLoggedIn(true);
        setSettingsContext('none');

        if (rememberMe) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ login: loginName }));
            setSavedLogin(loginName);
            return;
        }

        localStorage.removeItem(STORAGE_KEY);
        setSavedLogin('');
    };

    if (isDashboardScreenMode) {
        return (
            <div className="main-layout">
                <HeaderBar
                    lang={lang}
                    setLang={setLang}
                    user={user}
                    showUserMenu={false}
                    setShowUserMenu={setShowUserMenu}
                    onOpenAccountSettings={openAccountSettings}
                    onLogout={logout}
                    isLoggedIn={false}
                />

                <main className="dashboard-screen-main">
                    <DashboardWorkspace />
                </main>
            </div>
        );
    }

    return (
        <div className="main-layout">
            <HeaderBar
                lang={lang}
                setLang={setLang}
                user={user}
                showUserMenu={showUserMenu}
                setShowUserMenu={setShowUserMenu}
                onOpenAccountSettings={openAccountSettings}
                onLogout={logout}
                isLoggedIn={isLoggedIn}
            />

            {isLoggedIn ? (
                <>
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
                        {settingsContext !== 'account' && (
                            <SubMenuSidebar
                                currentSubMenu={currentSubMenu}
                                activeSubItem={activeSubItem}
                                onSubMenuClick={openSubMenuItem}
                            />
                        )}

                        <main className={`main-display ${activeTab === 7 && settingsContext !== 'account' ? 'dashboard-mode' : ''}`}>
                            <MainWorkspace
                                settingsContext={settingsContext}
                                user={user}
                                setUser={setUser}
                                closeAccountSettings={() => setSettingsContext('none')}
                                activeTab={activeTab}
                                currentSubMenu={currentSubMenu}
                                activeSubItem={activeSubItem}
                            />
                        </main>
                    </div>
                </>
            ) : (
                <LoginScreen savedLogin={savedLogin} onLogin={login} />
            )}
        </div>
    );
}

export default App;
