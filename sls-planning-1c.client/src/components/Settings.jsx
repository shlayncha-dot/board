import React from 'react';
import { t } from '../config/translations';

const Settings = ({ lang, user, setUser, setIsSettingsOpen }) => {
    return (
        <div className="settings-form">
            <h2>{t(lang, 'settings.profileTitle')}</h2>
            <div className="settings-split">
                <div className="settings-avatar">
                    <img src={user.avatar} alt="Avatar" />
                    <input
                        type="file"
                        id="ava-load"
                        hidden
                        onChange={(e) => setUser({ ...user, avatar: URL.createObjectURL(e.target.files[0]) })}
                    />
                    <label htmlFor="ava-load" className="load-btn">{t(lang, 'settings.changeAvatar')}</label>
                </div>
                <div className="settings-inputs">
                    <label>{t(lang, 'settings.firstName')}</label>
                    <input type="text" value={user.firstName} onChange={(e) => setUser({ ...user, firstName: e.target.value })} />
                    <label>{t(lang, 'settings.lastName')}</label>
                    <input type="text" value={user.lastName} onChange={(e) => setUser({ ...user, lastName: e.target.value })} />
                    <label>{t(lang, 'settings.phone')}</label>
                    <input type="text" value={user.phone} onChange={(e) => setUser({ ...user, phone: e.target.value })} />
                    <label>{t(lang, 'settings.email')}</label>
                    <input type="text" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} />
                    <button className="save-btn" onClick={() => setIsSettingsOpen(false)}>{t(lang, 'settings.save')}</button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
