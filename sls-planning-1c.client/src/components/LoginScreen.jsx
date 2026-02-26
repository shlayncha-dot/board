import React, { useState } from 'react';
import { t } from '../config/translations';

const LoginScreen = ({ lang, savedLogin, onLogin }) => {
    const [login, setLogin] = useState(savedLogin || '');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(Boolean(savedLogin));

    const handleSubmit = (event) => {
        event.preventDefault();
        onLogin({ login, password, rememberMe });
        setPassword('');
    };

    return (
        <div className="login-screen">
            <form className="login-card login-form" onSubmit={handleSubmit}>
                <h2>{t(lang, 'auth.loginTitle')}</h2>

                <label htmlFor="login-input">{t(lang, 'auth.login')}</label>
                <input
                    id="login-input"
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    required
                />

                <label htmlFor="password-input">{t(lang, 'auth.password')}</label>
                <input
                    id="password-input"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                />

                <label className="remember-line" htmlFor="remember-input">
                    <input
                        id="remember-input"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    {t(lang, 'auth.rememberMe')}
                </label>

                <button className="save-btn" type="submit">{t(lang, 'auth.submit')}</button>
            </form>
        </div>
    );
};

export default LoginScreen;
