const API_BASE = '/api/users';

async function readErrorMessage(response, fallback) {
    try {
        const data = await response.json();
        return data?.message || fallback;
    } catch {
        return fallback;
    }
}

export async function loginUser(login, password) {
    const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Ошибка авторизации.'));
    }

    return response.json();
}

export async function saveProfile(profile) {
    const response = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось сохранить профиль.'));
    }
}

export async function changePassword(payload) {
    const response = await fetch(`${API_BASE}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось сменить пароль.'));
    }
}

export async function getUsers(adminLogin) {
    const response = await fetch(`${API_BASE}?adminLogin=${encodeURIComponent(adminLogin)}`);

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось получить пользователей.'));
    }

    return response.json();
}

export async function getUserByLogin(login) {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(login)}`);

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось загрузить пользователя.'));
    }

    return response.json();
}

export async function createUser(payload) {
    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось создать пользователя.'));
    }
}

export async function updateUserAccess(payload) {
    const response = await fetch(`${API_BASE}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось обновить настройки пользователя.'));
    }
}

export async function uploadUserPhoto(login, file) {
    const formData = new FormData();
    formData.append('login', login);
    formData.append('photo', file);

    const response = await fetch(`${API_BASE}/photo`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось загрузить фото.'));
    }

    return response.json();
}
