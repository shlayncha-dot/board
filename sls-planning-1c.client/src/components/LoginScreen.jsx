import React, { useState } from 'react';

const LoginScreen = ({ savedLogin, onLogin }) => {
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
                <h2>Вход в систему</h2>

                <label htmlFor="login-input">Логин</label>
                <input
                    id="login-input"
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    required
                />

                <label htmlFor="password-input">Пароль</label>
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
                    Запомнить меня
                </label>

                <button className="save-btn" type="submit">Войти</button>
            </form>
        </div>
    );
};

export default LoginScreen;
