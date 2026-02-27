import React, { useEffect, useMemo, useState } from 'react';

const roles = ['Конструктор', 'Технолог', 'Производство', 'Сборка', 'PilotGroup', 'Oper', 'ОТК', 'Мастер', 'Склад'];
const adminOptions = ['Да', 'Нет'];

const mapUsersToDraft = (usersList) => usersList.map((item) => ({
    login: item.login,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    role: item.role || roles[0],
    status: item.status || 'Активен',
    isAdmin: item.isAdmin ? 'Да' : 'Нет',
    phone: item.phone || '',
    email: item.email || '',
    photoUrl: item.photoUrl || ''
}));

const AdminSettings = ({ usersList, onCreateUser, onSaveUserAccess, activeAdminSubItem }) => {
    const [createForm, setCreateForm] = useState({ login: '', password: '' });
    const [usersDraft, setUsersDraft] = useState([]);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const hasChanges = useMemo(() => usersDraft.some((item) => {
        const source = usersList.find((userItem) => userItem.login === item.login);
        if (!source) {
            return false;
        }

        return item.role !== (source.role || roles[0]) || item.isAdmin !== (source.isAdmin ? 'Да' : 'Нет');
    }), [usersDraft, usersList]);

    useEffect(() => {
        setUsersDraft(mapUsersToDraft(usersList));
    }, [usersList]);

    const handleCreate = async () => {
        setMessage('');
        setError('');
        try {
            await onCreateUser(createForm);
            setCreateForm({ login: '', password: '' });
            setMessage('Пользователь создан.');
        } catch (createError) {
            setError(createError.message || 'Ошибка создания пользователя.');
        }
    };

    const handleRoleChange = (login, value) => {
        setUsersDraft((prev) => prev.map((item) => (item.login === login ? { ...item, role: value } : item)));
    };

    const handleAdminChange = (login, value) => {
        setUsersDraft((prev) => prev.map((item) => (item.login === login ? { ...item, isAdmin: value } : item)));
    };

    const handleSaveAccess = async () => {
        setMessage('');
        setError('');
        try {
            const changedUsers = usersDraft.filter((item) => {
                const source = usersList.find((userItem) => userItem.login === item.login);
                if (!source) {
                    return false;
                }

                return item.role !== (source.role || roles[0]) || item.isAdmin !== (source.isAdmin ? 'Да' : 'Нет');
            });

            await Promise.all(changedUsers.map((item) => onSaveUserAccess({
                login: item.login,
                role: item.role,
                isAdmin: item.isAdmin === 'Да'
            })));

            setMessage('Настройки пользователей сохранены.');
        } catch (saveError) {
            setError(saveError.message || 'Ошибка сохранения настроек пользователя.');
        }
    };

    const handleCancel = () => {
        setUsersDraft(mapUsersToDraft(usersList));
        setMessage('');
        setError('');
    };

    return (
        <div className="admin-settings-grid">
            {activeAdminSubItem === 0 ? (
                <section className="admin-card">
                    <h3>Создать пользователя</h3>
                    <label>Login</label>
                    <input
                        type="text"
                        value={createForm.login}
                        onChange={(e) => setCreateForm({ ...createForm, login: e.target.value })}
                    />
                    <label>Пароль</label>
                    <input
                        type="password"
                        value={createForm.password}
                        onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    />
                    <button className="save-btn" onClick={handleCreate}>Сохранить</button>
                </section>
            ) : (
                <section className="admin-card admin-card--wide">
                    <h3>Настройки пользователей</h3>
                    <div className="admin-users-table-wrap">
                        <table className="admin-users-table">
                            <thead>
                                <tr>
                                    <th>№</th>
                                    <th>Логин</th>
                                    <th>Имя</th>
                                    <th>Фамилия</th>
                                    <th>Роль</th>
                                    <th>Статус админ</th>
                                    <th>Телефон</th>
                                    <th>Емейл</th>
                                    <th>Фото</th>
                                    <th>Пароль</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usersDraft.map((item, index) => (
                                    <tr key={item.login}>
                                        <td>{index + 1}</td>
                                        <td>{item.login}</td>
                                        <td>{item.firstName}</td>
                                        <td>{item.lastName}</td>
                                        <td>
                                            <select value={item.role} onChange={(e) => handleRoleChange(item.login, e.target.value)}>
                                                {roles.map((roleItem) => (
                                                    <option key={roleItem} value={roleItem}>{roleItem}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <select value={item.isAdmin} onChange={(e) => handleAdminChange(item.login, e.target.value)}>
                                                {adminOptions.map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>{item.phone}</td>
                                        <td>{item.email}</td>
                                        <td>{item.photoUrl ? <img src={item.photoUrl} alt="Фото пользователя" className="admin-user-photo" /> : '—'}</td>
                                        <td>••••••••</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="settings-btn-row">
                        <button className="save-btn" onClick={handleSaveAccess} disabled={!hasChanges}>Сохранить</button>
                        <button className="cancel-btn" onClick={handleCancel}>Отмена</button>
                    </div>
                </section>
            )}

            {message && <p className="form-success">{message}</p>}
            {error && <p className="form-error">{error}</p>}
        </div>
    );
};

export default AdminSettings;
