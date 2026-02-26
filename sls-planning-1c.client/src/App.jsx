import React, { useMemo, useState } from 'react';
import './App.css';
import LoginScreen from './components/LoginScreen';
import HeaderBar from './components/HeaderBar';
import SubMenuSidebar from './components/SubMenuSidebar';
import MainWorkspace from './components/MainWorkspace';
import DashboardWorkspace from './components/DashboardWorkspace';
import { menuConfig } from './config/menuConfig';
import { t } from './config/translations';

const STORAGE_KEY = 'sls-auth-data';

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(true);
    const [activeTab, setActiveTab] = useState(0);
    const [activeSubItem, setActiveSubItem] = useState(0);
    const [lang, setLang] = useState('RU');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [settingsContext, setSettingsContext] = useState('none');
    const [activeAdminSubItem, setActiveAdminSubItem] = useState(0);
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
        avatar: 'https://i.pravatar.cc/100?img=32',
        isAdmin: true
    });

    const isDashboardScreenMode = useMemo(() => {
        const pathName = window.location.pathname.toLowerCase();
        return pathName === '/dashboard-screen';
    }, []);

    const translatedMenu = useMemo(() => {
        return menuConfig.map((item) => ({
            label: t(lang, item.labelKey),
            subMenu: item.subMenuKeys.map((key) => t(lang, key))
        }));
    }, [lang]);

    const currentSubMenu = translatedMenu[activeTab].subMenu;

    const openTab = (index) => {
        setActiveTab(index);
        setActiveSubItem(0);
        setSettingsContext('none');
    };

    const openSubMenuItem = (_, index) => {
        setActiveSubItem(index);
        setSettingsContext('none');
    };

    const openAdminSubMenuItem = (_, index) => {
        setActiveAdminSubItem(index);
        setSettingsContext('admin');
    };

    const openAccountSettings = () => {
        setSettingsContext('account');
        setShowUserMenu(false);
    };

    const openAdminSettings = () => {
        setSettingsContext('admin');
        setActiveAdminSubItem(0);
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
                    onOpenAdmin={openAdminSettings}
                    onLogout={logout}
                    isLoggedIn={false}
                />

                <main className="dashboard-screen-main">
                    <DashboardWorkspace lang={lang} />
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
                onOpenAdmin={openAdminSettings}
                onLogout={logout}
                isLoggedIn={isLoggedIn}
            />

            {isLoggedIn ? (
                <>
                    <nav className="top-nav-container">
                        <div className="top-nav-grid">
                            {translatedMenu.map((item, index) => (
                                <div key={index} className={`nav-column ${activeTab === index ? 'active' : ''}`} onClick={() => openTab(index)}>
                                    <div className="nav-circle">
                                        <img src={`/images/menu/${index + 1}.png`} alt={item.label} className="menu-icon-img" />
                                    </div>
                                    <span className="nav-label">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </nav>

                    <div className="workspace">
                        {settingsContext !== 'account' && (
                            <SubMenuSidebar
                                currentSubMenu={settingsContext === 'admin' ? [t(lang, 'admin.userSettings')] : currentSubMenu}
                                activeSubItem={settingsContext === 'admin' ? activeAdminSubItem : activeSubItem}
                                onSubMenuClick={settingsContext === 'admin' ? openAdminSubMenuItem : openSubMenuItem}
                            />
                        )}

                        <main className={`main-display ${activeTab === 7 && settingsContext !== 'account' ? 'dashboard-mode' : ''}`}>
                            <MainWorkspace
                                lang={lang}
                                settingsContext={settingsContext}
                                user={user}
                                setUser={setUser}
                                closeAccountSettings={() => setSettingsContext('none')}
                                activeTab={activeTab}
                                currentSubMenu={currentSubMenu}
                                activeSubItem={activeSubItem}
                                activeAdminSubItem={activeAdminSubItem}
                            />
                        </main>
                    </div>
                </>
            ) : (
                <LoginScreen lang={lang} savedLogin={savedLogin} onLogin={login} />
            )}
        </div>
    );
}

export default App;
