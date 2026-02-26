import React, { useState } from 'react';
import './App.css';
// Импортируем наши новые файлы
import LoginScreen from './components/LoginScreen';
import Settings from './components/Settings';

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(true);
    const [activeTab, setActiveTab] = useState(0);
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

    const menuItems = [
        "Конструкторская документация", "Технолог", "Pilot Group",
        "Производство", "Сборка", "Мастер", "Планирование",
        "DashBoard", "ОТК", "Склад", "Комплектовщик"
    ];

    const savedUsers = [
        { name: 'Anna Smith', avatar: 'https://i.pravatar.cc/100?img=32' },
        { name: 'John Doe', avatar: 'https://i.pravatar.cc/100?img=12' }
    ];

    // Если не авторизован — показываем экран входа (вынесенный в файл)
    if (!isLoggedIn) {
        return <LoginScreen savedUsers={savedUsers} setIsLoggedIn={setIsLoggedIn} />;
    }

    return (
        <div className="main-layout">
            <header className="header">
                <div className="header-left">
                    <div className="logo-box">Лого-1</div>
                    <div className="time-block">26.05.2026<br /><b>18:45:10</b></div>
                </div>

                <div className="center-title">SLS Planning</div>

                <div className="header-right">
                    <div className="lang-select">
                        {['RU', 'GE', 'EN'].map(l => (
                            <button key={l} className={`lang-btn ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>{l}</button>
                        ))}
                    </div>
                    <div className="auth-wrapper">
                        <div className="auth-profile" onClick={() => setShowUserMenu(!showUserMenu)}>
                            <div className="avatar"><img src={user.avatar} alt="avatar" /></div>
                            <div className="user-info">
                                <div className="user-name">{user.firstName} {user.lastName}</div>
                                <div className="user-status">Premium Account</div>
                            </div>
                        </div>
                        {showUserMenu && (
                            <div className="dropdown-menu">
                                <button onClick={() => { setIsSettingsOpen(true); setShowUserMenu(false); }}>Настройки</button>
                                <button className="logout-btn" onClick={() => setIsLoggedIn(false)}>Выйти</button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <nav className="top-nav-container">
                <div className="top-nav-grid">
                    {menuItems.map((item, index) => (
                        <div key={index} className={`nav-column ${activeTab === index ? 'active' : ''}`} onClick={() => { setActiveTab(index); setIsSettingsOpen(false); }}>
                            <div className="nav-circle">
                                <img src={`/images/menu/${index + 1}.png`} alt={item} className="menu-icon-img" />
                            </div>
                            <span className="nav-label">{item}</span>
                        </div>
                    ))}
                </div>
            </nav>

            <div className="workspace">
                {activeTab !== 7 && !isSettingsOpen && (
                    <aside className="sidebar">
                        <button className="side-btn active">Загрузка спецификации</button>
                        <button className="side-btn">Проверка КД</button>
                        <button className="side-btn" onClick={() => setIsSettingsOpen(true)}>Настройки</button>
                    </aside>
                )}

                <main className="main-display">
                    {isSettingsOpen ? (
                        // Вызываем компонент настроек
                        <Settings user={user} setUser={setUser} setIsSettingsOpen={setIsSettingsOpen} />
                    ) : (
                        <div className="empty-state">
                            <h1>{menuItems[activeTab].toUpperCase()}</h1>
                            <p>Контент раздела находится в разработке</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;