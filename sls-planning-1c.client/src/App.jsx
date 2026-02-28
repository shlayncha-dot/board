import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import LoginScreen from './components/LoginScreen';
import HeaderBar from './components/HeaderBar';
import SubMenuSidebar from './components/SubMenuSidebar';
import MainWorkspace from './components/MainWorkspace';
import DashboardWorkspace from './components/DashboardWorkspace';
import { menuConfig } from './config/menuConfig';
import { t } from './config/translations';
import { createUser, getUserByLogin, getUsers, loginUser, updateUserAccess } from './services/userService';

const STORAGE_KEY = 'sls-auth-data';

const getStoredAuthData = () => {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object') {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }

        const login = String(parsed.login ?? '').trim();

        if (!login) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }

        return {
            login,
            user: parsed.user && typeof parsed.user === 'object'
                ? {
                    login: String(parsed.user.login ?? login),
                    role: String(parsed.user.role ?? 'Oper'),
                    firstName: String(parsed.user.firstName ?? ''),
                    lastName: String(parsed.user.lastName ?? ''),
                    phone: String(parsed.user.phone ?? ''),
                    email: String(parsed.user.email ?? ''),
                    photoUrl: String(parsed.user.photoUrl ?? ''),
                    isAdmin: Boolean(parsed.user.isAdmin)
                }
                : null
        };
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
};

function App() {
    const [storedAuthData] = useState(() => getStoredAuthData());

    const [isLoggedIn, setIsLoggedIn] = useState(Boolean(storedAuthData?.user));
    const [activeTab, setActiveTab] = useState(0);
    const [activeSubItem, setActiveSubItem] = useState(0);
    const [lang, setLang] = useState('RU');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [settingsContext, setSettingsContext] = useState('none');
    const [activeAdminSubItem, setActiveAdminSubItem] = useState(0);
    const [usersList, setUsersList] = useState([]);
    const [savedLogin, setSavedLogin] = useState(storedAuthData?.login || '');

    const [user, setUser] = useState(storedAuthData?.user || {
        login: '',
        role: 'Oper',
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        photoUrl: '',
        isAdmin: false
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

    useEffect(() => {
        let isMounted = true;

        const restoreActualUser = async () => {
            if (!storedAuthData?.user?.login) {
                return;
            }

            try {
                const actualUser = await getUserByLogin(storedAuthData.user.login);

                if (!isMounted) {
                    return;
                }

                setUser(actualUser);
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    login: storedAuthData.login,
                    user: actualUser
                }));
            } catch {
                if (!isMounted) {
                    return;
                }

                setIsLoggedIn(false);
                setSettingsContext('none');
                setUsersList([]);
                localStorage.removeItem(STORAGE_KEY);
                setSavedLogin('');
            }
        };

        restoreActualUser();

        return () => {
            isMounted = false;
        };
    }, [storedAuthData]);

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

    const openAdminSettings = async () => {
        setSettingsContext('admin');
        setActiveAdminSubItem(0);
        setShowUserMenu(false);

        if (!user.isAdmin) {
            return;
        }

        try {
            const users = await getUsers(user.login);
            setUsersList(users);
        } catch {
            setUsersList([]);
        }
    };

    const logout = () => {
        setIsLoggedIn(false);
        setShowUserMenu(false);
        setSettingsContext('none');
        setUsersList([]);
        localStorage.removeItem(STORAGE_KEY);
        setSavedLogin('');
    };

    const login = async ({ login: loginName, password, rememberMe }) => {
        const authenticatedUser = await loginUser(loginName, password);
        setUser(authenticatedUser);
        setIsLoggedIn(true);
        setSettingsContext('none');

        if (rememberMe) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                login: loginName,
                user: authenticatedUser
            }));
            setSavedLogin(loginName);
            return;
        }

        localStorage.removeItem(STORAGE_KEY);
        setSavedLogin('');
    };

    const handleCreateUser = async ({ login: loginName, password }) => {
        await createUser({ adminLogin: user.login, login: loginName, password });
        const users = await getUsers(user.login);
        setUsersList(users);
    };

    const handleSaveUserAccess = async ({ login: loginName, role, isAdmin }) => {
        await updateUserAccess({ adminLogin: user.login, login: loginName, role, isAdmin });
        const users = await getUsers(user.login);
        setUsersList(users);
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
                                currentSubMenu={settingsContext === 'admin' ? [t(lang, 'admin.createUser'), t(lang, 'admin.userSettings')] : currentSubMenu}
                                activeSubItem={settingsContext === 'admin' ? activeAdminSubItem : activeSubItem}
                                onSubMenuClick={settingsContext === 'admin' ? openAdminSubMenuItem : openSubMenuItem}
                            />
                        )}

                        <main className={`main-display ${activeTab === 7 && settingsContext !== 'account' ? 'dashboard-mode' : ''} ${activeTab === 0 && settingsContext === 'none' ? 'design-docs-mode' : ''} ${activeTab === 1 && activeSubItem === 0 && settingsContext === 'none' ? 'route-sheets-mode' : ''} ${activeTab === 1 && activeSubItem === 2 && settingsContext === 'none' ? 'tech-settings-mode' : ''} ${settingsContext === 'admin' ? 'admin-mode' : ''} ${settingsContext === 'account' ? 'account-mode' : ''}`}>
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
                                usersList={usersList}
                                onCreateUser={handleCreateUser}
                                onSaveUserAccess={handleSaveUserAccess}
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
