import React, { useEffect, useMemo, useState } from 'react';
import { t } from '../config/translations';

const HeaderBar = ({
    lang,
    setLang,
    user,
    showUserMenu,
    setShowUserMenu,
    onOpenAccountSettings,
    onOpenAdmin,
    onLogout,
    isLoggedIn
}) => {
    const [now, setNow] = useState(() => new Date());
    const [isOnline, setIsOnline] = useState(() => navigator.onLine);

    useEffect(() => {
        const timerId = setInterval(() => {
            setNow(new Date());
        }, 1000);

        return () => clearInterval(timerId);
    }, []);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const { dateText, timeText } = useMemo(() => {
        const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        return {
            dateText: dateFormatter.format(now),
            timeText: timeFormatter.format(now)
        };
    }, [now]);

    return (
        <header className="header">
            <div className="header-left">
                <div className="logo-box">
                    <img src="/images/logo1.png" alt="SLS logo" className="logo-img" />
                </div>
                <div className="time-block">
                    {dateText}<br /><b>{timeText}</b>
                </div>
                <span className={`header-network-status ${isOnline ? 'is-online' : 'is-offline'}`}>
                    <span className="header-network-dot" aria-hidden="true" />
                    {isOnline ? 'Online' : 'Offline'}
                </span>
            </div>

            <div className="center-title">SLS Planning</div>

            <div className="header-right">
                <div className="lang-select">
                    {['RU', 'GE', 'EN'].map((language) => (
                        <button
                            key={language}
                            className={`lang-btn ${lang === language ? 'active' : ''}`}
                            onClick={() => setLang(language)}
                        >
                            {language}
                        </button>
                    ))}
                </div>

                <div className="logo-box logo-box-small header-account-logo">
                    <img src="/images/logo2.png" alt="SLS account logo" className="logo-img" />
                </div>

                {isLoggedIn && (
                    <>
                        <div className="auth-wrapper">
                            <div className="auth-profile" onClick={() => setShowUserMenu(!showUserMenu)}>
                                <div className="avatar"><img src={user.photoUrl || 'https://i.pravatar.cc/100?img=32'} alt="avatar" /></div>
                                <div className="user-info">
                                    <div className="user-name">{user.firstName || user.login} {user.lastName}</div>
                                    <div className="user-status">{t(lang, 'header.premiumAccount')}</div>
                                </div>
                            </div>

                            {showUserMenu && (
                                <div className="dropdown-menu">
                                    <button onClick={onOpenAccountSettings}>{t(lang, 'header.accountSettings')}</button>
                                    {user.isAdmin && <button onClick={onOpenAdmin}>{t(lang, 'header.admin')}</button>}
                                    <button className="logout-btn" onClick={onLogout}>{t(lang, 'header.logout')}</button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </header>
    );
};

export default HeaderBar;
