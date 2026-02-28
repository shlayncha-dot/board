const API_BASE = '/api/technologist/route-sheet-settings';

async function readErrorMessage(response, fallback) {
    try {
        const data = await response.json();
        return data?.message || fallback;
    } catch {
        return fallback;
    }
}

export async function getRouteSheetSettings() {
    const response = await fetch(API_BASE);

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось загрузить настройки маршрутного листа.'));
    }

    return response.json();
}

export async function saveRouteSheetSettings(payload) {
    const response = await fetch(API_BASE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось сохранить настройки маршрутного листа.'));
    }

    return response.json();
}
