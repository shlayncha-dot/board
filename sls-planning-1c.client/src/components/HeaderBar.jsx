import React from 'react';
import { t } from '../config/translations';

const HeaderBar = ({
    lang,
    setLang,
    user,
    showUserMenu,
    setShowUserMenu,
    onOpenAccountSettings,
    onLogout,
    isLoggedIn
}) => {
    return (
        <header className="header">
            <div className="header-left">
                <div className="logo-box">
                    <img src="/images/logo1.png" alt="SLS logo" className="logo-img" />
                </div>
                <div className="time-block">26.05.2026<br /><b>18:45:10</b></div>
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
                                <div className="avatar"><img src={user.avatar} alt="avatar" /></div>
                                <div className="user-info">
                                    <div className="user-name">{user.firstName} {user.lastName}</div>
                                    <div className="user-status">{t(lang, 'header.premiumAccount')}</div>
                                </div>
                            </div>

                            {showUserMenu && (
                                <div className="dropdown-menu">
                                    <button onClick={onOpenAccountSettings}>{t(lang, 'header.accountSettings')}</button>
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
