import React from 'react';

const Settings = ({ user, setUser, setIsSettingsOpen }) => {
    return (
        <div className="settings-form">
            <h2>Настройки профиля</h2>
            <div className="settings-split">
                <div className="settings-avatar">
                    <img src={user.avatar} alt="Avatar" />
                    <input
                        type="file"
                        id="ava-load"
                        hidden
                        onChange={(e) => setUser({ ...user, avatar: URL.createObjectURL(e.target.files[0]) })}
                    />
                    <label htmlFor="ava-load" className="load-btn">Сменить аватар</label>
                </div>
                <div className="settings-inputs">
                    <label>Имя</label>
                    <input type="text" value={user.firstName} onChange={(e) => setUser({ ...user, firstName: e.target.value })} />
                    <label>Фамилия</label>
                    <input type="text" value={user.lastName} onChange={(e) => setUser({ ...user, lastName: e.target.value })} />
                    <label>Телефон</label>
                    <input type="text" value={user.phone} onChange={(e) => setUser({ ...user, phone: e.target.value })} />
                    <label>Email</label>
                    <input type="text" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} />
                    <button className="save-btn" onClick={() => setIsSettingsOpen(false)}>Сохранить</button>
                </div>
            </div>
        </div>
    );
};

export default Settings;