const ASSEMBLY_API_BASE = '/api/assembly-stages/procedures';
const SPECIFICATION_API_BASE = '/api/specification-upload/specifications';

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

    const response = await fetch(`${ASSEMBLY_API_BASE}?specificationName=${encodeURIComponent(specificationName.trim())}`);

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось загрузить процедуры сборки.'));
    }

    return response.json();
}

export async function createAssemblyProcedure(payload) {
    const response = await fetch(ASSEMBLY_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось создать процедуру сборки.'));
    }

    return response.json();
}

export async function getUploadedSpecifications() {
    const response = await fetch(SPECIFICATION_API_BASE);

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось загрузить список спецификаций.'));
    }

    return response.json();
}

export async function downloadSpecificationFile(specificationId) {
    const response = await fetch(`${SPECIFICATION_API_BASE}/${encodeURIComponent(specificationId)}/file`);

    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не удалось загрузить файл спецификации.'));
    }

    return response.blob();
}
