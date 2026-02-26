import React from 'react';

const LoginScreen = ({ savedUsers, setIsLoggedIn }) => {
    return (
        <div className="login-screen">
            <div className="login-card">
                <h2>Выберите пользователя</h2>
                <div className="saved-users-grid">
                    {savedUsers.map((u, i) => (
                        <div key={i} className="user-login-item" onClick={() => setIsLoggedIn(true)}>
                            <img src={u.avatar} alt={u.name} />
                            <span>{u.name}</span>
                        </div>
                    ))}
                    <div className="user-login-item add-new">
                        <div className="plus-icon">+</div>
                        <span>Новый вход</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;