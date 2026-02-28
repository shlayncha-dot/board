const API_BASE = '/api/assembly-stages/procedures';

async function readErrorMessage(response, fallback) {
    try {
        const data = await response.json();
        return data?.message || fallback;
    } catch {
        return fallback;
    }
}

export async function getAssemblyProcedures(specificationName) {
    if (!specificationName?.trim()) {
        return [];
    }

    const response = await fetch(`${API_BASE}?specificationName=${encodeURIComponent(specificationName.trim())}`);

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось загрузить процедуры сборки.'));
    }

    return response.json();
}

export async function createAssemblyProcedure(payload) {
    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось создать процедуру сборки.'));
    }

    return response.json();
}
