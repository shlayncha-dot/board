import React, { useRef, useState } from 'react';
import { t } from '../config/translations';
import { changePassword, saveProfile, uploadUserPhoto } from '../services/userService';

const Settings = ({ lang, user, setUser, setIsSettingsOpen }) => {
    const [form, setForm] = useState({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        email: user.email,
        photoUrl: user.photoUrl
    });
    const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const fileInputRef = useRef(null);

    const onSaveAll = async () => {
        setMessage('');
        setError('');

        try {
            await saveProfile({ ...form, login: user.login });

            const shouldChangePassword = passwordForm.oldPassword || passwordForm.newPassword || passwordForm.confirmNewPassword;
            if (shouldChangePassword) {
                await changePassword({ login: user.login, ...passwordForm });
                setPasswordForm({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
            }

            setUser({ ...user, ...form });
            setMessage(shouldChangePassword ? 'Профиль и пароль сохранены.' : 'Профиль сохранен.');
        } catch (saveError) {
            setError(saveError.message || 'Ошибка сохранения профиля.');
        }
    };

    const onPhotoSelected = async (event) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) {
            return;
        }

        setMessage('');
        setError('');
        setIsUploadingPhoto(true);

        try {
            const response = await uploadUserPhoto(user.login, selectedFile);
            const nextPhotoUrl = response.photoUrl || '';
            setForm((previous) => ({ ...previous, photoUrl: nextPhotoUrl }));
            setMessage('Фото обновлено. Не забудьте нажать «Сохранить».');
        } catch (uploadError) {
            setError(uploadError.message || 'Ошибка загрузки фото.');
        } finally {
            setIsUploadingPhoto(false);
            event.target.value = '';
        }
    };

    return (
        <div className="settings-form">
            <h2>{t(lang, 'settings.profileTitle')}</h2>

            <div className="settings-split">
                <div className="settings-avatar">
                    <img src={form.photoUrl || 'https://i.pravatar.cc/150?img=32'} alt="Avatar" />
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="settings-photo-input"
                        onChange={onPhotoSelected}
                    />
                    <button
                        type="button"
                        className="cancel-btn settings-photo-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                    >
                        {isUploadingPhoto ? t(lang, 'namingAuth.saving') : t(lang, 'settings.changePhoto')}
                    </button>
                </div>

                <div className="settings-inputs">
                    <label>{t(lang, 'settings.firstName')}</label>
                    <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />

                    <label>{t(lang, 'settings.lastName')}</label>
                    <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />

                    <label>{t(lang, 'settings.phone')}</label>
                    <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

                    <label>{t(lang, 'settings.email')}</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
            </div>

            <div className="password-panel">
                <h3>{t(lang, 'settings.changePassword')}</h3>

                <label>{t(lang, 'settings.oldPassword')}</label>
                <input
                    type="password"
                    value={passwordForm.oldPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                />

                <label>{t(lang, 'settings.newPassword')}</label>
                <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                />

                <label>{t(lang, 'settings.confirmPassword')}</label>
                <input
                    type="password"
                    value={passwordForm.confirmNewPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmNewPassword: e.target.value })}
                />
            </div>

            <div className="settings-btn-row settings-btn-row--bottom">
                <button className="save-btn" onClick={onSaveAll}>{t(lang, 'settings.save')}</button>
                <button className="cancel-btn" onClick={() => setIsSettingsOpen(false)}>{t(lang, 'settings.cancel')}</button>
            </div>

            {message && <p className="form-success">{message}</p>}
            {error && <p className="form-error">{error}</p>}
        </div>
    );
};

export default Settings;
