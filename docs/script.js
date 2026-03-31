const input = document.getElementById('imageInput');
const grid = document.getElementById('gridContainer');
const generateBtn = document.getElementById('generateBtn');
const uploadLoader = document.getElementById('uploadLoader');
const uploadLoaderTitle = document.getElementById('uploadLoaderTitle');
const uploadLoaderCount = document.getElementById('uploadLoaderCount');
const toastContainer = document.getElementById('toastContainer');
const generateProgressText = document.getElementById('generateProgressText');
const storageUsageCard = document.getElementById('storageUsageCard');
const storageUsageMeta = document.getElementById('storageUsageMeta');
const storageUsageFill = document.getElementById('storageUsageFill');
const storageUsageDetail = document.getElementById('storageUsageDetail');
const storageUsageFiles = document.getElementById('storageUsageFiles');
const storageSessionsDropdown = document.getElementById('storageSessionsDropdown');
const deviceCacheDetail = document.getElementById('deviceCacheDetail');
const deviceQuotaDetail = document.getElementById('deviceQuotaDetail');
const appLoaderOverlay = document.getElementById('appLoaderOverlay');
const appLoaderLabel = document.getElementById('appLoaderLabel');
const exportLoaderOverlay = document.getElementById('exportLoaderOverlay');
const exportLoaderTitle = document.getElementById('exportLoaderTitle');
const exportLoaderText = document.getElementById('exportLoaderText');
const deleteLoaderOverlay = document.getElementById('deleteLoaderOverlay');
const deleteLoaderTitle = document.getElementById('deleteLoaderTitle');
const deleteLoaderText = document.getElementById('deleteLoaderText');
const saveLoaderOverlay = document.getElementById('saveLoaderOverlay');
const saveLoaderTitle = document.getElementById('saveLoaderTitle');
const saveLoaderText = document.getElementById('saveLoaderText');
const OPEN_SESSION_STORAGE_KEY = 'backend-reportes.currentSessionName';
const SESSION_DRAFT_STORAGE_PREFIX = 'backend-reportes.sessionDraft.';
const SESSION_AUTOSAVE_STORAGE_PREFIX = 'backend-reportes.sessionAutosave.';
const LOOSE_AUTOSAVE_STORAGE_KEY = 'backend-reportes.looseAutosaveAt';
const LOOSE_IMAGE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const SESSION_AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;
const CLIENT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CLIENT_ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif'
]);
let imageCount = 0;
let imagesData = [];
let appInitialized = false;
let currentSessionName = '';
let hasUnsavedSessionChanges = false;
let looseImageCountdownTimer = null;
let looseImagesNoticeCollapsed = false;
let looseImagesNoticePeekTimer = null;
let deleteLoaderShownAt = 0;
let saveLoaderShownAt = 0;
let appLoaderShownAt = 0;
let uploadLoaderShownAt = 0;
let looseImagesNoticePeekHideTimer = null;
let sessionAutosaveTicker = null;
let isSessionAutosaving = false;
let nextSessionAutosaveAt = 0;
let undoStack = [];
let sessionSummaries = [];
let latestStorageUsage = null;
const loadedImagePreviewSources = new Set();
const MAX_UNDO_STATES = 25;

// Agregar input para número inicial de imagen
let imageStartNumber = 1;

input.addEventListener('change', handleImageUpload);

function showToast(message, type = 'info') {
    if (!toastContainer || !message) return;

    while (toastContainer.children.length >= 3) {
        toastContainer.removeChild(toastContainer.firstElementChild);
    }

    const icons = {
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-message">${message}</div>
        <button type="button" class="toast-close" aria-label="Cerrar">×</button>
    `;

    const removeToast = () => {
        if (toast.dataset.leaving === 'true') return;
        toast.dataset.leaving = 'true';
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), 220);
    };

    toast.querySelector('.toast-close').onclick = removeToast;
    toastContainer.appendChild(toast);
    setTimeout(removeToast, 3000);
}

function showAppLoader(message = 'Cargando sesión...') {
    if (!appLoaderOverlay) return;
    if (appLoaderLabel) {
        appLoaderLabel.textContent = message;
    }
    appLoaderShownAt = Date.now();
    appLoaderOverlay.classList.add('is-visible');
    appLoaderOverlay.setAttribute('aria-hidden', 'false');
}

async function hideAppLoader(minDuration = 0) {
    if (!appLoaderOverlay) return;
    const elapsed = Date.now() - appLoaderShownAt;
    const remaining = Math.max(0, minDuration - elapsed);
    if (remaining) {
        await new Promise(resolve => setTimeout(resolve, remaining));
    }
    appLoaderOverlay.classList.remove('is-visible');
    appLoaderOverlay.setAttribute('aria-hidden', 'true');
}

function showExportLoader(title = 'Generando reporte Word', text = 'Estamos preparando tu documento...') {
    if (!exportLoaderOverlay) return;
    if (exportLoaderTitle) exportLoaderTitle.textContent = title;
    if (exportLoaderText) exportLoaderText.textContent = text;
    exportLoaderOverlay.classList.add('is-visible');
    exportLoaderOverlay.setAttribute('aria-hidden', 'false');
}

function hideExportLoader() {
    if (!exportLoaderOverlay) return;
    exportLoaderOverlay.classList.remove('is-visible');
    exportLoaderOverlay.setAttribute('aria-hidden', 'true');
}

function showDeleteLoader(title = 'Eliminando...', text = 'Estamos limpiando la información seleccionada.') {
    if (!deleteLoaderOverlay) return;
    if (deleteLoaderTitle) deleteLoaderTitle.textContent = title;
    if (deleteLoaderText) deleteLoaderText.textContent = text;
    deleteLoaderShownAt = Date.now();
    deleteLoaderOverlay.classList.add('is-visible');
    deleteLoaderOverlay.setAttribute('aria-hidden', 'false');
}

async function hideDeleteLoader() {
    if (!deleteLoaderOverlay) return;
    const elapsed = Date.now() - deleteLoaderShownAt;
    const remaining = Math.max(0, 1100 - elapsed);
    if (remaining) {
        await new Promise(resolve => setTimeout(resolve, remaining));
    }
    deleteLoaderOverlay.classList.remove('is-visible');
    deleteLoaderOverlay.setAttribute('aria-hidden', 'true');
}

function showDecisionDialog({
    title = 'Confirmar acción',
    message = '',
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
    tertiaryText = '',
    tone = 'primary',
    showCancel = true,
    icon = '•'
} = {}) {
    return new Promise((resolve) => {
        const old = document.getElementById('appDecisionModal');
        if (old) old.remove();
        const actionCount = (showCancel ? 1 : 0) + (tertiaryText ? 1 : 0) + 1;
        const actionsClass = [
            'app-decision-actions',
            !showCancel && !tertiaryText ? 'single-action' : '',
            actionCount === 2 ? 'two-actions' : '',
            actionCount >= 3 ? 'three-actions' : ''
        ].filter(Boolean).join(' ');

        const modal = document.createElement('div');
        modal.id = 'appDecisionModal';
        modal.className = 'app-decision-modal';
        modal.innerHTML = `
          <div class="app-decision-card">
            <div class="app-decision-icon app-decision-icon-${tone}">${icon}</div>
            <div class="app-decision-title">${title}</div>
            <div class="app-decision-message">${message}</div>
            <div class="${actionsClass}">
              ${showCancel ? `<button type="button" class="app-decision-btn app-decision-btn-cancel" id="appDecisionCancel">${cancelText}</button>` : ''}
              ${tertiaryText ? `<button type="button" class="app-decision-btn app-decision-btn-tertiary" id="appDecisionTertiary">${tertiaryText}</button>` : ''}
              <button type="button" class="app-decision-btn app-decision-btn-confirm app-decision-btn-${tone}" id="appDecisionConfirm">${confirmText}</button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        const close = (result) => {
            modal.remove();
            resolve(result);
        };

        const confirmBtn = document.getElementById('appDecisionConfirm');
        const cancelBtn = document.getElementById('appDecisionCancel');
        const tertiaryBtn = document.getElementById('appDecisionTertiary');
        if (confirmBtn) confirmBtn.onclick = () => close(true);
        if (cancelBtn) cancelBtn.onclick = () => close(false);
        if (tertiaryBtn) tertiaryBtn.onclick = () => close('tertiary');
        modal.addEventListener('mousedown', (event) => {
            if (event.target === modal) close(false);
        });
    });
}

function showUploadLoader(current = 0, total = 0, message = 'Subiendo fotos') {
    if (uploadLoader) {
        uploadLoader.style.display = 'flex';
    }
    uploadLoaderShownAt = uploadLoaderShownAt || Date.now();
    if (uploadLoaderTitle) {
        uploadLoaderTitle.textContent = message;
    }
    if (uploadLoaderCount) {
        uploadLoaderCount.textContent = `${current}/${total}`;
    }
}

function formatBytes(bytes) {
    const safeBytes = Number(bytes || 0);
    if (safeBytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(safeBytes) / Math.log(1024)), units.length - 1);
    const value = safeBytes / (1024 ** exponent);
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatUsagePercent(percent) {
    const safePercent = Number(percent || 0);
    if (safePercent <= 0) return '0%';
    if (safePercent < 0.001) return `${safePercent.toFixed(4)}%`;
    if (safePercent < 0.01) return `${safePercent.toFixed(3)}%`;
    if (safePercent < 0.1) return `${safePercent.toFixed(2)}%`;
    if (safePercent < 1) return `${safePercent.toFixed(1)}%`;
    return `${Math.round(safePercent)}%`;
}

function renderStorageSessionsDropdown() {
    if (!storageSessionsDropdown) return;

    const resolvedSessions = Array.isArray(sessionSummaries)
        ? sessionSummaries.map((session) => ({
            ...session,
            photoCount: Number(session.photoCount || 0)
        }))
        : [];
    const currentWorkspacePhotos = Array.isArray(imagesData) ? imagesData.length : 0;
    const currentSessionIndex = currentSessionName
        ? resolvedSessions.findIndex((session) => session.name === currentSessionName)
        : -1;

    if (currentSessionName && currentWorkspacePhotos > 0) {
        if (currentSessionIndex >= 0) {
            resolvedSessions[currentSessionIndex] = {
                ...resolvedSessions[currentSessionIndex],
                photoCount: Math.max(resolvedSessions[currentSessionIndex].photoCount, currentWorkspacePhotos)
            };
        } else {
            resolvedSessions.push({
                name: currentSessionName,
                photoCount: currentWorkspacePhotos
            });
        }
    }

    const sessionsWithPhotos = resolvedSessions.filter((session) => session.photoCount > 0);
    const totalSessionPhotos = sessionsWithPhotos.reduce((sum, session) => sum + session.photoCount, 0);
    const looseWorkspacePhotos = !currentSessionName
        ? imagesData.filter((img) => img && (img._scope === 'library' || !img._scope)).length
        : 0;
    const loosePhotosCount = !currentSessionName
        ? Math.max(looseWorkspacePhotos, Math.max(0, Number(latestStorageUsage?.filesCount || 0) - totalSessionPhotos))
        : 0;
    const rows = [];

    if (loosePhotosCount > 0) {
        rows.push({
            name: 'Sin sesión',
            photoCount: loosePhotosCount
        });
    }

    rows.push(...sessionsWithPhotos);

    if (rows.length === 0) {
        storageSessionsDropdown.innerHTML = `
            <div class="storage-session-empty">Aún no hay sesiones con fotos guardadas.</div>
        `;
        return;
    }

    storageSessionsDropdown.innerHTML = `
        <div class="storage-sessions-list">
            ${rows.map((session) => `
                <div class="storage-session-item">
                    <span class="storage-session-name">${session.name}</span>
                    <span class="storage-session-count">${session.photoCount} foto${session.photoCount === 1 ? '' : 's'}</span>
                </div>
            `).join('')}
        </div>
    `;
}

if (storageUsageFiles && storageSessionsDropdown) {
    const setStorageDropdownOpen = (isOpen) => {
        storageUsageCard?.classList.toggle('storage-dropdown-open', isOpen);
        storageSessionsDropdown.classList.toggle('is-open', isOpen);
        storageSessionsDropdown.hidden = !isOpen;
        storageSessionsDropdown.setAttribute('aria-hidden', String(!isOpen));
        storageUsageFiles.setAttribute('aria-expanded', String(isOpen));
    };

    setStorageDropdownOpen(false);

    storageUsageFiles.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = !storageSessionsDropdown.classList.contains('is-open');
        setStorageDropdownOpen(isOpen);
    });

    document.addEventListener('click', (event) => {
        if (!storageUsageCard || !storageUsageCard.contains(event.target)) {
            setStorageDropdownOpen(false);
        }
    });
}

function updateDeviceCacheUsage() {
    if (!deviceCacheDetail) return;

    try {
        const cacheKeys = Object.keys(localStorage).filter((key) => key.startsWith(SESSION_DRAFT_STORAGE_PREFIX));
        const totalChars = cacheKeys.reduce((sum, key) => {
            const value = localStorage.getItem(key) || '';
            return sum + key.length + value.length;
        }, 0);
        const totalBytes = totalChars * 2;
        const draftsCount = cacheKeys.length;

        deviceCacheDetail.textContent = totalBytes > 0
            ? `${formatBytes(totalBytes)} usados en ${draftsCount} borrador${draftsCount === 1 ? '' : 'es'} local${draftsCount === 1 ? '' : 'es'} de esta app.`
            : '0 B usados. No hay borradores locales pendientes en esta app.';
    } catch (error) {
        deviceCacheDetail.textContent = 'No se pudo leer el caché local del dispositivo.';
    }

    void updateDeviceQuotaEstimate();
}

async function updateDeviceQuotaEstimate() {
    if (!deviceQuotaDetail) return;

    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
        deviceQuotaDetail.textContent = 'Este navegador no expone una cuota local estimada para esta app.';
        return;
    }

    try {
        const estimate = await navigator.storage.estimate();
        const usage = Number(estimate?.usage || 0);
        const quota = Number(estimate?.quota || 0);
        const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;
        const remaining = Math.max(0, quota - usage);

        deviceQuotaDetail.textContent = quota > 0
            ? `${formatBytes(usage)} usados, ${formatBytes(remaining)} libres de ${formatBytes(quota)} reportados por el navegador para esta app (${formatUsagePercent(usagePercent)}).`
            : 'No se pudo calcular la cuota local estimada para esta app.';
    } catch (error) {
        deviceQuotaDetail.textContent = 'No se pudo calcular la cuota local estimada para esta app.';
    }
}

function getImageDisplaySource(image, fallback = '') {
    if (image?.signedUrl) return image.signedUrl;
    if (typeof image?.src === 'string' && image.src) return image.src;
    if (typeof image?.imageData === 'string' && image.imageData) return image.imageData;
    return fallback;
}

function buildSessionImagePayload(image) {
    const payload = {
        description: image.description || '',
        status: image.status || '',
        createdAt: image.createdAt || new Date()
    };

    const currentSrc = typeof image.src === 'string' ? image.src : '';
    const currentImageData = typeof image.imageData === 'string' ? image.imageData : '';

    if (currentSrc.startsWith('data:image/')) {
        payload.imageData = currentSrc;
        return payload;
    }

    if (currentImageData.startsWith('data:image/')) {
        payload.imageData = currentImageData;
        return payload;
    }

    if (image.storagePath && image.mimeType) {
        payload.storagePath = image.storagePath;
        payload.mimeType = image.mimeType;
        payload._id = image._id || '';
        return payload;
    }

    payload.imageData = currentSrc || currentImageData;
    return payload;
}

function cloneImageForUndo(image) {
    return {
        ...image,
        crop: image?.crop ? { ...image.crop } : undefined
    };
}

function createUndoSnapshot(label = 'Cambio') {
    return {
        label,
        currentSessionName,
        hasUnsavedSessionChanges,
        nextSessionAutosaveAt,
        imageStartNumber,
        imagesData: imagesData.map(cloneImageForUndo)
    };
}

function pushUndoState(label = 'Cambio') {
    undoStack.push(createUndoSnapshot(label));
    if (undoStack.length > MAX_UNDO_STATES) {
        undoStack.shift();
    }
}

function restoreUndoSnapshot(snapshot) {
    if (!snapshot) return false;

    imagesData = Array.isArray(snapshot.imagesData)
        ? snapshot.imagesData.map(cloneImageForUndo)
        : [];
    imageCount = imagesData.length;
    imageStartNumber = Number(snapshot.imageStartNumber || 1);
    setCurrentSession(snapshot.currentSessionName || '');
    hasUnsavedSessionChanges = Boolean(snapshot.hasUnsavedSessionChanges && currentSessionName);
    nextSessionAutosaveAt = hasUnsavedSessionChanges ? Number(snapshot.nextSessionAutosaveAt || 0) : 0;

    if (currentSessionName) {
        persistSessionAutosaveDeadline(currentSessionName, nextSessionAutosaveAt);
        if (hasUnsavedSessionChanges) {
            persistSessionDraftCache();
        } else {
            clearSessionDraftCache(currentSessionName);
        }
    }

    renderGrid();
    updateImageCounter();
    updateCurrentSessionBanner();
    updateSessionActionLayout();
    return true;
}

function undoLastAction() {
    if (undoStack.length === 0) {
        showToast('No hay acciones recientes para deshacer.', 'info');
        return;
    }

    const snapshot = undoStack.pop();
    if (restoreUndoSnapshot(snapshot)) {
        showToast(`Se deshizo: ${snapshot.label}.`, 'info');
    }
}

async function fetchStorageUsage() {
    if (!storageUsageCard) return;
    try {
        const res = await apiFetch('/usage');
        if (!res.ok) {
            throw new Error('No se pudo consultar el uso del bucket');
        }

        const usage = await res.json();
        latestStorageUsage = usage;
        const usagePercent = Number.isFinite(usage.usagePercent) ? usage.usagePercent : 0;
        storageUsageCard.hidden = false;
        if (storageUsageFill) storageUsageFill.style.width = `${Math.max(4, usagePercent)}%`;
        if (storageUsageMeta) {
            storageUsageMeta.textContent = usage.filesCount > 0
                ? `${formatBytes(usage.usedBytes)} de ${formatBytes(usage.limitBytes)} usados`
                : `0 B de ${formatBytes(usage.limitBytes)} usados`;
        }
        if (storageUsageDetail) {
            storageUsageDetail.textContent = usage.filesCount > 0
                ? `${formatUsagePercent(usagePercent)} del espacio disponible para tus fotos`
                : 'Aún no hay fotos guardadas';
        }
        if (storageUsageFiles) {
            const filesCount = Number(usage.filesCount || 0);
            storageUsageFiles.textContent = `${filesCount} foto${filesCount === 1 ? '' : 's'} guardada${filesCount === 1 ? '' : 's'}`;
        }
        renderStorageSessionsDropdown();
        updateDeviceCacheUsage();
    } catch (error) {
        console.error('No se pudo cargar el uso de espacio:', error);
        latestStorageUsage = null;
        storageUsageCard.hidden = true;
        updateDeviceCacheUsage();
    }
}

async function hideUploadLoader() {
    if (uploadLoader) {
        const elapsed = Date.now() - uploadLoaderShownAt;
        const remaining = Math.max(0, 5000 - elapsed);
        if (remaining) {
            await new Promise(resolve => setTimeout(resolve, remaining));
        }
        uploadLoader.style.display = 'none';
    }
    uploadLoaderShownAt = 0;
}

function showSaveLoader(title = 'Guardando cambios...', text = 'Estamos guardando tus fotos y datos de la sesión.') {
    if (!saveLoaderOverlay) return;
    if (saveLoaderTitle) saveLoaderTitle.textContent = title;
    if (saveLoaderText) saveLoaderText.textContent = text;
    saveLoaderShownAt = Date.now();
    saveLoaderOverlay.classList.add('is-visible');
    saveLoaderOverlay.setAttribute('aria-hidden', 'false');
}

async function hideSaveLoader() {
    if (!saveLoaderOverlay) return;
    const elapsed = Date.now() - saveLoaderShownAt;
    const remaining = Math.max(0, 1100 - elapsed);
    if (remaining) {
        await new Promise(resolve => setTimeout(resolve, remaining));
    }
    saveLoaderOverlay.classList.remove('is-visible');
    saveLoaderOverlay.setAttribute('aria-hidden', 'true');
}

function formatRemainingLifetime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const totalHours = totalSeconds / 3600;
    const totalDays = Math.ceil(totalSeconds / 86400);

    if (totalHours > 12) {
        if (totalDays <= 1) return '1 día';
        return `${totalDays} días`;
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function getLooseImagesRemainingMs() {
    const looseImages = !currentSessionName
        ? imagesData.filter((img) => img && (img._scope === 'library' || !img._scope))
        : [];

    if (looseImages.length === 0) {
        return 0;
    }

    const expirationTimestamps = looseImages
        .map((img) => new Date(img.createdAt || Date.now()).getTime() + LOOSE_IMAGE_RETENTION_MS)
        .filter((value) => Number.isFinite(value));

    if (expirationTimestamps.length === 0) {
        return 0;
    }

    return Math.max(0, Math.min(...expirationTimestamps) - Date.now());
}

function updateLooseImagesExpiryNotice() {
    const existing = document.getElementById('looseImagesExpiryNotice');
    if (existing) existing.remove();
    if (looseImagesNoticePeekTimer) {
        clearInterval(looseImagesNoticePeekTimer);
        looseImagesNoticePeekTimer = null;
    }
    if (looseImagesNoticePeekHideTimer) {
        clearTimeout(looseImagesNoticePeekHideTimer);
        looseImagesNoticePeekHideTimer = null;
    }
}

function ensureLooseImagesCountdown() {
    if (looseImageCountdownTimer) {
        clearInterval(looseImageCountdownTimer);
    }
    looseImageCountdownTimer = setInterval(() => {
        updateLooseImagesExpiryNotice();
        if (currentSessionName || imagesData.length > 0 || nextSessionAutosaveAt) {
            updateCurrentSessionBanner();
        }
    }, 1000);
    updateLooseImagesExpiryNotice();
}

function formatAutosaveCountdown(ms) {
    const safeMs = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(safeMs / 60);
    const seconds = safeMs % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function persistLooseAutosaveDeadline(timestamp = 0) {
    try {
        if (timestamp && Number(timestamp) > Date.now()) {
            localStorage.setItem(LOOSE_AUTOSAVE_STORAGE_KEY, String(Number(timestamp)));
        } else {
            localStorage.removeItem(LOOSE_AUTOSAVE_STORAGE_KEY);
        }
    } catch (error) {
        // Ignorar errores del almacenamiento local.
    }
}

function readLooseAutosaveDeadline() {
    try {
        const raw = localStorage.getItem(LOOSE_AUTOSAVE_STORAGE_KEY);
        const value = Number(raw || 0);
        return Number.isFinite(value) ? value : 0;
    } catch (error) {
        return 0;
    }
}

function resetSessionAutosaveDeadline() {
    nextSessionAutosaveAt = Date.now() + SESSION_AUTOSAVE_INTERVAL_MS;
    if (currentSessionName) {
        persistSessionAutosaveDeadline(currentSessionName, nextSessionAutosaveAt);
    } else {
        persistLooseAutosaveDeadline(nextSessionAutosaveAt);
    }
}

function ensureSessionAutosave() {
    if (sessionAutosaveTicker) {
        clearInterval(sessionAutosaveTicker);
    }

    sessionAutosaveTicker = setInterval(async () => {
        if (!hasUnsavedSessionChanges || !nextSessionAutosaveAt || isSessionAutosaving) {
            return;
        }

        if (Date.now() < nextSessionAutosaveAt) {
            return;
        }

        try {
            if (currentSessionName) {
                await persistCurrentSessionChanges({ silent: true, source: 'autosave' });
                showToast(`Auto-guardado completado en "${currentSessionName}".`, 'success');
            } else {
                await saveSession();
                markSessionDirty(false);
                fetchStorageUsage();
                showToast('Auto-guardado completado en Sin sesión.', 'success');
            }
        } catch (error) {
            console.error('Error en auto-guardado de sesión:', error);
            showToast(currentSessionName ? `No se pudo auto-guardar la sesión "${currentSessionName}".` : 'No se pudo auto-guardar Sin sesión.', 'error');
            resetSessionAutosaveDeadline();
            updateCurrentSessionBanner();
        }
    }, 1000);
}

async function initializeApp() {
    if (appInitialized) return;
    appInitialized = true;
    updateImageCounter();
    addSessionControls();
    setupSessionDropdownMenu();
    ensureLooseImagesCountdown();
    ensureSessionAutosave();
    showToast('Conectando con el servidor de fotos...', 'info');
    await resolveApiBaseUrl();
    showToast('Servidor conectado correctamente.', 'success');
    fetchStorageUsage();
    updateDeviceCacheUsage();
    await restoreInitialWorkspace();
}

window.addEventListener('DOMContentLoaded', initializeApp);

// --- Configuración de backend ---
const DEFAULT_REMOTE_API_BASE_URL = 'https://backend-reportes-lzfl.onrender.com';
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1'];
let API_BASE_URL = '';
let apiResolutionPromise = null;

function getApiCandidates() {
    const candidates = [];
    const configuredApi =
        (typeof window !== 'undefined' && typeof window.REPORTES_API_BASE_URL === 'string'
            ? window.REPORTES_API_BASE_URL
            : '') ||
        localStorage.getItem('backend-reportes.apiBaseUrl') ||
        '';

    const sameOriginApi = `${window.location.protocol}//${window.location.host}`;
    const forceLocalApi = localStorage.getItem('backend-reportes.useLocalApi') === 'true';
    const isLocalHost = LOCAL_HOSTNAMES.includes(window.location.hostname);

    if (configuredApi) candidates.push(configuredApi.trim());
    if (isLocalHost && window.location.port === '3001') {
        candidates.push(sameOriginApi);
        if (forceLocalApi && sameOriginApi !== 'http://localhost:3001') {
            candidates.push('http://localhost:3001');
        }
    } else if (isLocalHost && forceLocalApi) {
        candidates.push('http://localhost:3001');
        candidates.push(DEFAULT_REMOTE_API_BASE_URL);
    } else if (isLocalHost) {
        candidates.push(DEFAULT_REMOTE_API_BASE_URL);
    } else {
        candidates.push(sameOriginApi);
        if (sameOriginApi !== DEFAULT_REMOTE_API_BASE_URL) {
            candidates.push(DEFAULT_REMOTE_API_BASE_URL);
        }
    }

    return [...new Set(candidates.filter(Boolean).map((url) => url.replace(/\/+$/, '')))];
}

async function canReachApi(baseUrl) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (_) {
        return false;
    }
}

async function waitForApi(baseUrl, options = {}) {
    const {
        timeoutMs = 45000,
        retryDelayMs = 2500
    } = options;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        // eslint-disable-next-line no-await-in-loop
        const reachable = await canReachApi(baseUrl);
        if (reachable) {
            return true;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    return false;
}

async function resolveApiBaseUrl() {
    if (API_BASE_URL) {
        return API_BASE_URL;
    }

    if (apiResolutionPromise) {
        return apiResolutionPromise;
    }

    apiResolutionPromise = (async () => {
        const candidates = getApiCandidates();

        for (const candidate of candidates) {
            const isRemoteCandidate = /^https?:\/\//i.test(candidate) && !candidate.includes('localhost:3001');
            // eslint-disable-next-line no-await-in-loop
            const reachable = await waitForApi(candidate, {
                timeoutMs: isRemoteCandidate ? 45000 : 5000,
                retryDelayMs: isRemoteCandidate ? 3000 : 1500
            });
            if (reachable) {
                API_BASE_URL = candidate;
                return API_BASE_URL;
            }
        }

        API_BASE_URL = candidates.includes(DEFAULT_REMOTE_API_BASE_URL)
            ? DEFAULT_REMOTE_API_BASE_URL
            : (candidates[0] || DEFAULT_REMOTE_API_BASE_URL);
        return API_BASE_URL;
    })();

    try {
        return await apiResolutionPromise;
    } finally {
        apiResolutionPromise = null;
    }
}

async function apiFetch(path, options) {
    let baseUrl = await resolveApiBaseUrl();

    try {
        return await fetch(`${baseUrl}${path}`, options);
    } catch (error) {
        API_BASE_URL = '';
        baseUrl = await resolveApiBaseUrl();
        return fetch(`${baseUrl}${path}`, options);
    }
}

// --- Reemplazar localStorage por backend ---
async function saveSession() {
    syncDescriptionsFromDOM();
    const requests = imagesData
        .filter(img => img._id)
        .map(img => apiFetch(`/image/${img._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: img.description, status: img.status })
        }));

    await Promise.all(requests);
}

async function persistCurrentSessionChanges(options = {}) {
    const {
        name = currentSessionName,
        silent = false,
        source = 'manual'
    } = options;

    const safeName = (name || '').trim();

    if (!safeName) {
        throw new Error('No hay una sesión abierta para guardar.');
    }

    syncDescriptionsFromDOM && syncDescriptionsFromDOM();
    const images = imagesData.map(buildSessionImagePayload);

    if (source === 'autosave') {
        isSessionAutosaving = true;
    }

    const shouldShowSaveLoader = source !== 'autosave' && !silent;

    try {
        if (shouldShowSaveLoader) {
            showSaveLoader('Guardando cambios...', `Estamos actualizando la sesión "${safeName}".`);
        }
        const res = await apiFetch('/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: safeName, images })
        });

        if (!res.ok) {
            throw new Error(await res.text());
        }

        const savedSession = await res.json();
        if (savedSession && Array.isArray(savedSession.images)) {
            imagesData = savedSession.images.map(img => ({
                ...img,
                imageData: '',
                src: getImageDisplaySource(img),
                _scope: 'session'
            }));
            imageCount = imagesData.length;
            renderGrid();
            updateImageCounter();
        }

        setCurrentSession(safeName);
        markSessionDirty(false);
        clearSessionDraftCache(safeName);
        await loadSessionList(safeName);
        fetchStorageUsage();

        if (!silent) {
            showToast(`Cambios guardados en la sesión "${safeName}".`, 'success');
        }

        return savedSession;
    } finally {
        if (shouldShowSaveLoader) {
            await hideSaveLoader();
        }
        if (source === 'autosave') {
            isSessionAutosaving = false;
        }
    }
}

async function loadSession() {
    const res = await apiFetch('/images?includeImageData=false');
    if (!res.ok) {
        throw new Error('No se pudieron cargar las imágenes');
    }
    const data = await res.json();
    imagesData = data.map(img => ({ ...img, src: getImageDisplaySource(img), _scope: 'library' }));
    imageCount = imagesData.length;
    imageStartNumber = 1;
    const looseAutosaveAt = readLooseAutosaveDeadline();
    if (!currentSessionName && imagesData.length > 0 && looseAutosaveAt > Date.now()) {
        hasUnsavedSessionChanges = true;
        nextSessionAutosaveAt = looseAutosaveAt;
    }
    renderGrid();
    if (imagesData.length > 0) generateBtn.disabled = false;
}

function getStoredOpenSession() {
    try {
        return localStorage.getItem(OPEN_SESSION_STORAGE_KEY) || '';
    } catch (error) {
        return '';
    }
}

function getSessionDraftStorageKey(sessionName) {
    return `${SESSION_DRAFT_STORAGE_PREFIX}${(sessionName || '').trim()}`;
}

function getSessionAutosaveStorageKey(sessionName) {
    return `${SESSION_AUTOSAVE_STORAGE_PREFIX}${(sessionName || '').trim()}`;
}

function persistSessionAutosaveDeadline(sessionName, timestamp = 0) {
    const safeName = (sessionName || '').trim();
    if (!safeName) return;

    try {
        if (timestamp && Number(timestamp) > Date.now()) {
            localStorage.setItem(getSessionAutosaveStorageKey(safeName), String(Number(timestamp)));
        } else {
            localStorage.removeItem(getSessionAutosaveStorageKey(safeName));
        }
    } catch (error) {
        // Ignorar errores del almacenamiento local.
    }
}

function readSessionAutosaveDeadline(sessionName) {
    const safeName = (sessionName || '').trim();
    if (!safeName) return 0;

    try {
        const raw = localStorage.getItem(getSessionAutosaveStorageKey(safeName));
        const value = Number(raw || 0);
        return Number.isFinite(value) ? value : 0;
    } catch (error) {
        return 0;
    }
}

function readSessionDraftCache(sessionName) {
    const safeName = (sessionName || '').trim();
    if (!safeName) return null;

    try {
        const raw = localStorage.getItem(getSessionDraftStorageKey(safeName));
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function clearSessionDraftCache(sessionName = currentSessionName) {
    const safeName = (sessionName || '').trim();
    if (!safeName) return;

    try {
        localStorage.removeItem(getSessionDraftStorageKey(safeName));
        localStorage.removeItem(getSessionAutosaveStorageKey(safeName));
    } catch (error) {
        // Ignorar errores del caché local.
    }
}

function serializeSessionDraftImage(image) {
    return {
        _id: image._id || '',
        _draftId: image._draftId || '',
        _scope: image._scope || 'session',
        _localDraft: Boolean(image._localDraft),
        description: image.description || '',
        status: image.status || '',
        createdAt: image.createdAt || new Date().toISOString(),
        storagePath: image.storagePath || '',
        mimeType: image.mimeType || '',
        src: image.src || '',
        imageData: image.imageData || ''
    };
}

function persistSessionDraftCache() {
    if (!currentSessionName || !hasUnsavedSessionChanges) {
        return;
    }

    try {
        localStorage.setItem(getSessionDraftStorageKey(currentSessionName), JSON.stringify({
            sessionName: currentSessionName,
            imageStartNumber,
            updatedAt: new Date().toISOString(),
            autosaveAt: nextSessionAutosaveAt || 0,
            images: imagesData.map(serializeSessionDraftImage)
        }));
    } catch (error) {
        // Ignorar errores del caché local.
    }
}

function restoreSessionDraftIntoState(sessionName) {
    const draft = readSessionDraftCache(sessionName);
    if (!draft || !Array.isArray(draft.images) || draft.images.length === 0) {
        return false;
    }

    imagesData = draft.images.map((img) => ({
        ...img,
        src: getImageDisplaySource(img),
        imageData: img.imageData || (typeof img.src === 'string' && img.src.startsWith('data:image/') ? img.src : ''),
        _scope: img._scope || (img._localDraft ? 'session-draft' : 'session')
    }));
    imageCount = imagesData.length;
    imageStartNumber = Number(draft.imageStartNumber || 1);
    hasUnsavedSessionChanges = true;
    const cachedAutosaveAt = Number(draft.autosaveAt || readSessionAutosaveDeadline(sessionName) || 0);
    nextSessionAutosaveAt = cachedAutosaveAt > Date.now()
        ? cachedAutosaveAt
        : Date.now() + SESSION_AUTOSAVE_INTERVAL_MS;
    persistSessionAutosaveDeadline(sessionName, nextSessionAutosaveAt);
    return true;
}

function persistOpenSession(name = '') {
    try {
        if (name) {
            localStorage.setItem(OPEN_SESSION_STORAGE_KEY, name);
        } else {
            localStorage.removeItem(OPEN_SESSION_STORAGE_KEY);
        }
    } catch (error) {
        // Ignorar errores de almacenamiento local para no romper la UI.
    }
}

async function restoreInitialWorkspace() {
    const storedSessionName = getStoredOpenSession();

    try {
        await loadSessionList(storedSessionName);

        if (storedSessionName) {
            const sessionSelect = document.getElementById('sessionList');
            if (sessionSelect && sessionSelect.value === storedSessionName) {
                await loadSessionFromDB({ sessionName: storedSessionName, silent: true });
                return;
            }

            setCurrentSession('');
        }

        showAppLoader('Cargando fotos sin sesión...');
        await loadSession();
    } catch (error) {
        console.error('Error inicializando imágenes:', error);
        showToast('No se pudieron cargar las imágenes iniciales.', 'error');
    } finally {
        await hideAppLoader(5000);
    }
}

// --- Eliminar imagen en backend ---
window.removeImage = async function(idx, event) {
    event.stopPropagation();
    const img = imagesData[idx];
    const isSessionWorkspaceImage = img && (img._scope === 'session' || img._scope === 'session-draft');

    if (!isSessionWorkspaceImage && img._id) {
        const res = await apiFetch(`/image/${img._id}`, { method: 'DELETE' });
        if (!res.ok) {
            showToast('No se pudo eliminar la imagen.', 'error');
            return;
        }
    }
    if (isSessionWorkspaceImage) {
        pushUndoState('Eliminar imagen');
    }
    imagesData.splice(idx, 1);
    imageCount = imagesData.length;
    renderGrid();
    if (imagesData.length === 0) {
        generateBtn.disabled = true;
    }
    updateImageCounter();

    if (isSessionWorkspaceImage && currentSessionName) {
        markSessionDirty(true);
        showToast('Imagen quitada de la sesión abierta. Guarda los cambios para aplicarlo.', 'info');
    }
};

// --- Actualizar descripción/estado en backend ---
window.updateImageData = async function(idx, field, value) {
    if (!imagesData[idx]) return;
    if ((imagesData[idx][field] || '') === value) return;
    if (currentSessionName) {
        pushUndoState(field === 'status' ? 'Cambiar estado' : 'Editar descripción');
    }
    imagesData[idx][field] = value;
    if (currentSessionName) {
        markSessionDirty(true);
    }
    const card = document.querySelector(`.image-box[data-index="${idx}"]`);
    if (card && field === 'status') {
        card.classList.remove('card-verde', 'card-amarillo', 'card-rojo');
        const newClass = getCardStatusClass(value);
        if (newClass) card.classList.add(newClass);
    }
    if (imagesData[idx]._id && !currentSessionName) {
        const res = await apiFetch(`/image/${imagesData[idx]._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: imagesData[idx].description, status: imagesData[idx].status })
        });
        if (!res.ok) {
            showToast('No se pudo actualizar la imagen.', 'error');
        }
    }
    updateImageCounter();
};

// --- Contador y límite de imágenes ---
// Eliminar MAX_IMAGES y mostrar solo la cantidad de imágenes subidas
function updateImageCounter() {
    updateCurrentSessionBanner();
    updateLooseImagesExpiryNotice();
    let counter = document.getElementById('imageCounter');
    if (!counter) {
        counter = document.createElement('div');
        counter.id = 'imageCounter';
        const gridParent = grid.parentElement;
        if (gridParent) gridParent.insertBefore(counter, grid);
        else document.body.insertBefore(counter, grid);
    }
    let total = imagesData.length;
    // Input bonito para el número inicial
    counter.innerHTML =
      `<span class="stat-pill stat-pill-input">
        <b class="stat-label">Num. inicial</b>
        <input type='number' id='imageStartNumberInput' min='1' value='${imageStartNumber}' style='width:60px;font-size:1.08rem;font-weight:bold;border-radius:8px;border:2px solid #3498db;padding:2px 8px;color:#2c3e50;text-align:center;'/>
      </span>` +
      `<span id="stateCounter" class="stat-pill">
        <span class="stat-label">Estados seleccionados</span>
        <span class="stat-value"><span id="stateCountValue"></span> / ${total}</span>
      </span>` +
      `<span id="descCounter" class="stat-pill">
        <span class="stat-label">Descripciones llenas</span>
        <span class="stat-value"><span id="descCountValue"></span> / ${total}</span>
      </span>` +
      `<span class="stat-pill stat-pill-total">
        <span class="stat-label">Imágenes subidas</span>
        <span class="stat-value">${total}</span>
      </span>`;
    // Evento para el input de número inicial
    const input = counter.querySelector('#imageStartNumberInput');
    if (input) {
        input.value = imageStartNumber; // Siempre sincroniza el valor visual
        input.onchange = function() {
            let val = parseInt(this.value, 10);
            if (isNaN(val) || val < 1) val = 1;
            imageStartNumber = val;
            renderGrid();
            updateImageCounter();
        };
    }
    let descFilled = imagesData.filter(img => (img.description && img.description.trim().length > 0)).length;
    let stateFilled = imagesData.filter(img => (img.status && img.status !== "")).length;
    let descCountValue = document.getElementById('descCountValue');
    let stateCountValue = document.getElementById('stateCountValue');
    if (descCountValue) descCountValue.textContent = descFilled;
    if (stateCountValue) stateCountValue.textContent = stateFilled;
    updateGenerateSummary(total, descFilled, stateFilled);
    // Alternar clase en body para mostrar/ocultar el botón y altura card
    if (typeof document !== 'undefined') {
        if (total > 0) {
            document.body.classList.add('has-images');
        } else {
            document.body.classList.remove('has-images');
        }
    }
}

function setCurrentSession(name = '') {
    currentSessionName = (name || '').trim();
    persistOpenSession(currentSessionName);

    if (!currentSessionName) {
        hasUnsavedSessionChanges = false;
        nextSessionAutosaveAt = 0;
        persistSessionAutosaveDeadline('', 0);
    }

    const sessionSelect = document.getElementById('sessionList');
    if (sessionSelect) {
        sessionSelect.value = currentSessionName || '';
    }

    const sessionInput = document.getElementById('sessionNameInput');
    if (sessionInput) {
        sessionInput.value = currentSessionName;
    }

    const sessionNameLabel = document.getElementById('sessionNameLabel');
    if (sessionNameLabel) {
        sessionNameLabel.textContent = currentSessionName
            ? 'Nombre de la sesión actual'
            : 'Nombrar sesión actual para guardar';
    }

    updateCurrentSessionBanner();
    updateLooseImagesExpiryNotice();
    updateSessionActionLayout();
}

function updateCurrentSessionBanner() {
    const gridParent = grid && grid.parentElement ? grid.parentElement : null;
    if (!gridParent) return;

    let banner = document.getElementById('currentSessionBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'currentSessionBanner';
        banner.className = 'current-session-banner';
        gridParent.insertBefore(banner, gridParent.firstChild);
    }

    const hasDraftWithoutSession = !currentSessionName && imagesData.length > 0;

    if (currentSessionName || hasDraftWithoutSession) {
        const bannerTitle = currentSessionName || 'Sin titulo guardado';
        const bannerKicker = currentSessionName ? 'Sesion abierta' : 'Sin sesion';
        const bannerState = currentSessionName
            ? (hasUnsavedSessionChanges ? 'Cambios sin guardar' : 'Todo guardado')
            : (hasUnsavedSessionChanges ? 'Cambios sin guardar en Sin sesión' : 'Todo guardado en Sin sesión');
        const autosaveLabel = hasUnsavedSessionChanges && nextSessionAutosaveAt
            ? `Auto-guardado en ${formatAutosaveCountdown(nextSessionAutosaveAt - Date.now())}`
            : 'Sin cambios pendientes';
        const looseImagesRemaining = !currentSessionName ? getLooseImagesRemainingMs() : 0;
        const looseExpiryMarkup = !currentSessionName && looseImagesRemaining
            ? `<span class="current-session-expiry">Se borrará en ${formatRemainingLifetime(looseImagesRemaining)}</span>`
            : '';

        banner.innerHTML = `
            <div class="current-session-copy">
                <div class="current-session-head">
                    <span class="current-session-kicker">${bannerKicker}</span>
                    ${looseExpiryMarkup}
                </div>
                <strong class="current-session-name">${bannerTitle}</strong>
            </div>
            <div class="current-session-meta">
                <span class="current-session-autosave ${(hasUnsavedSessionChanges && nextSessionAutosaveAt) ? 'is-counting' : 'is-idle'}">${autosaveLabel}</span>
                <span class="current-session-state ${!hasUnsavedSessionChanges ? 'is-saved' : 'is-dirty'}">
                    ${bannerState}
                </span>
            </div>
        `;
        banner.classList.toggle('is-loose-session', !currentSessionName);
        banner.classList.add('is-visible');
    } else {
        banner.innerHTML = '';
        banner.classList.remove('is-loose-session');
        banner.classList.remove('is-visible');
    }
}

function markSessionDirty(isDirty = true) {
    const wasDirty = hasUnsavedSessionChanges;
    const canTrackWorkspaceChanges = Boolean(currentSessionName || imagesData.length > 0);
    hasUnsavedSessionChanges = canTrackWorkspaceChanges && isDirty;
    if (currentSessionName || (!currentSessionName && imagesData.length > 0)) {
        if (hasUnsavedSessionChanges) {
            if (!wasDirty || !nextSessionAutosaveAt || nextSessionAutosaveAt <= Date.now()) {
                resetSessionAutosaveDeadline();
            } else {
                if (currentSessionName) {
                    persistSessionAutosaveDeadline(currentSessionName, nextSessionAutosaveAt);
                } else {
                    persistLooseAutosaveDeadline(nextSessionAutosaveAt);
                }
            }
            if (currentSessionName) {
                persistSessionDraftCache();
            }
        } else {
            nextSessionAutosaveAt = 0;
            if (currentSessionName) {
                persistSessionAutosaveDeadline(currentSessionName, 0);
                clearSessionDraftCache(currentSessionName);
            } else {
                persistLooseAutosaveDeadline(0);
            }
        }
    }
    updateCurrentSessionBanner();
}

function updateSessionActionLayout() {
    const select = document.getElementById('sessionList');
    const sessionPanel = document.querySelector('.session-panel');
    const reloadSavedBtn = document.getElementById('reloadSavedBtn');
    const loadSessionBtn = document.getElementById('loadSessionBtn');
    const saveChangesBtn = document.getElementById('saveChangesBtn');
    const selectedName = select && select.value ? select.value.trim() : '';
    const hasDifferentSelectedSession = Boolean(selectedName && selectedName !== currentSessionName);
    const hasSelectedSession = Boolean((selectedName || currentSessionName) && selectedName !== currentSessionName);

    if (sessionPanel) {
        sessionPanel.classList.toggle('has-selected-session', hasSelectedSession);
    }

    if (loadSessionBtn) {
        loadSessionBtn.style.display = hasDifferentSelectedSession ? 'inline-flex' : 'none';
        const loadLabel = loadSessionBtn.querySelector('span:last-child');
        if (loadLabel) {
            loadLabel.textContent = hasDifferentSelectedSession ? `Cargar ${selectedName}` : 'Cargar';
        }
    }

    if (saveChangesBtn) {
        const label = saveChangesBtn.querySelector('span:last-child');
        if (label) {
            if (hasDifferentSelectedSession) {
                label.textContent = 'Guardar en la sesión seleccionada';
            } else {
                label.textContent = 'Guardar';
            }
        }
    }

    if (reloadSavedBtn) {
        const canReloadSaved = Boolean(currentSessionName);
        reloadSavedBtn.style.display = canReloadSaved ? 'inline-flex' : 'none';
    }
}

async function handlePrimarySessionSave() {
    const select = document.getElementById('sessionList');
    const selectedName = select && select.value ? select.value.trim() : '';
    const typedNameInput = document.getElementById('sessionNameInput');
    const typedName = typedNameInput && typedNameInput.value ? typedNameInput.value.trim() : '';
    const hasDifferentSelectedSession = Boolean(currentSessionName && selectedName && selectedName !== currentSessionName);

    if (!currentSessionName && typedName) {
        return saveSessionToDB();
    }

    if (currentSessionName || hasDifferentSelectedSession) {
        return window.saveChangesToCurrentSession();
    }

    return saveSessionToDB();
}

function shouldConfirmSessionSwitch(nextSelection = '') {
    return Boolean(currentSessionName && hasUnsavedSessionChanges && nextSelection !== currentSessionName);
}

async function discardUnsavedSessionDrafts() {
    const draftImages = imagesData.filter((img) => img && img._scope === 'session-draft' && img._id);
    if (draftImages.length === 0) {
        clearSessionDraftCache(currentSessionName);
        return;
    }

    await Promise.allSettled(
        draftImages.map((img) =>
            apiFetch(`/image/${img._id}`, { method: 'DELETE' })
        )
    );
    clearSessionDraftCache(currentSessionName);
}

async function switchToLibraryWorkspace() {
    showAppLoader('Volviendo a fotos sin sesión...');
    try {
        await loadSession();
        setCurrentSession('');
        markSessionDirty(false);
        renderGrid();
        updateImageCounter();
    } finally {
        hideAppLoader();
    }
}

function updateGenerateSummary(total, descFilled, stateFilled) {
    const completed = imagesData.filter(img =>
        img.description && img.description.trim().length > 0 && img.status && img.status !== ''
    ).length;
    const green = imagesData.filter(img => img.status === 'verde').length;
    const yellow = imagesData.filter(img => img.status === 'amarillo').length;
    const red = imagesData.filter(img => img.status === 'rojo').length;

    if (generateProgressText) {
        generateProgressText.textContent = `${completed}/${total} imágenes completas`;
    }

    const summaryGreen = document.getElementById('summaryGreen');
    const summaryYellow = document.getElementById('summaryYellow');
    const summaryRed = document.getElementById('summaryRed');
    if (summaryGreen) summaryGreen.textContent = green;
    if (summaryYellow) summaryYellow.textContent = yellow;
    if (summaryRed) summaryRed.textContent = red;

    const generateProgressStatus = document.getElementById('generateProgressStatus');
    if (generateProgressStatus) {
        if (total === 0) {
            generateProgressStatus.textContent = 'Carga al menos una imagen para empezar el informe.';
        } else if (completed === total) {
            generateProgressStatus.textContent = 'Todo está listo para generar el reporte.';
        } else {
            generateProgressStatus.textContent = `Faltan ${total - completed} imagen${total - completed === 1 ? '' : 'es'} por completar antes del reporte final.`;
        }
    }

    if (generateBtn) {
        const isReady = total > 0 && completed === total;
        const canGenerate = total > 0;
        generateBtn.disabled = !canGenerate;
        generateBtn.classList.toggle('generate-btn-ready', isReady);
        generateBtn.classList.toggle('generate-btn-pending', canGenerate && !isReady);
        generateBtn.classList.toggle('generate-btn-disabled', !canGenerate);
        generateBtn.title = canGenerate
            ? (isReady ? 'Generar reporte Word' : 'Puedes generar el reporte y revisar los faltantes antes de exportar.')
            : 'Carga al menos una imagen para habilitar esta acción';
    }
}

function getCardStatusClass(status) {
    if (status === 'verde') return 'card-verde';
    if (status === 'amarillo') return 'card-amarillo';
    if (status === 'rojo') return 'card-rojo';
    return '';
}

function updateSelectStyle(select) {
    if (!select) return;
    select.classList.remove('status-verde', 'status-amarillo', 'status-rojo');
    if (select.value === 'verde') select.classList.add('status-verde');
    if (select.value === 'amarillo') select.classList.add('status-amarillo');
    if (select.value === 'rojo') select.classList.add('status-rojo');
}

function validateImageFile(file) {
    if (!file) {
        return 'No se pudo leer el archivo seleccionado.';
    }

    if (!CLIENT_ALLOWED_IMAGE_TYPES.has(file.type)) {
        return `La imagen "${file.name}" no tiene un formato permitido. Usa JPG, PNG, WEBP, GIF o AVIF.`;
    }

    if (Number(file.size || 0) > CLIENT_MAX_IMAGE_BYTES) {
        return `La imagen "${file.name}" supera el máximo permitido de 8 MB.`;
    }

    return '';
}

async function handleImageUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    const skippedFiles = [];
    uploadLoaderShownAt = 0;
    if (currentSessionName) {
        pushUndoState(files.length > 1 ? 'Agregar imágenes' : 'Agregar imagen');
    }
    showUploadLoader(0, files.length, 'Subiendo fotos');

    for (let i = 0; i < files.length; i++) {
        try {
            const validationError = validateImageFile(files[i]);
            if (validationError) {
                skippedFiles.push(validationError);
                showToast(validationError, 'error');
                showUploadLoader(i + 1, files.length, 'Subiendo fotos');
                continue;
            }

            const resizedDataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    resizeImage(e.target.result, 1024, resolve);
                };
                reader.onerror = () => reject(new Error('Error leyendo la imagen.'));
                reader.readAsDataURL(files[i]);
            });

            if (currentSessionName) {
                imagesData.push({
                    _id: '',
                    _draftId: `draft-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
                    description: '',
                    status: '',
                    createdAt: new Date().toISOString(),
                    storagePath: '',
                    mimeType: files[i].type || 'image/jpeg',
                    src: resizedDataUrl,
                    imageData: resizedDataUrl,
                    _scope: 'session-draft',
                    _localDraft: true
                });
                markSessionDirty(true);
            } else {
                const res = await apiFetch('/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageData: resizedDataUrl, description: '', status: '' })
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || 'No se pudo subir la imagen');
                }

                const img = await res.json();
                img.src = getImageDisplaySource(img, resizedDataUrl);
                img.imageData = '';
                img._scope = 'library';
                imagesData.push(img);
                markSessionDirty(true);
            }
        } catch (err) {
            console.error('Error procesando imagen:', err);
            skippedFiles.push(`No se pudo cargar "${files[i]?.name || 'la imagen'}".`);
            showToast(`No se pudo cargar "${files[i]?.name || 'la imagen'}".`, 'error');
        }
        showUploadLoader(i + 1, files.length, 'Subiendo fotos');
    }

    imageCount = imagesData.length;
    renderGrid();
    await hideUploadLoader();
    if (!currentSessionName) {
        fetchStorageUsage();
    }
    if (skippedFiles.length > 0) {
        showToast(`${skippedFiles.length} archivo${skippedFiles.length === 1 ? '' : 's'} se omitieron durante la carga.`, 'info');
    }
    generateBtn.disabled = imagesData.length === 0;
    if (event && event.target) {
        event.target.value = '';
    }
}

// Redimensiona la imagen a un máximo de maxSize px (ancho o alto)
function resizeImage(dataUrl, maxSize, callback) {
    const img = new window.Image();
    img.onload = function() {
        let width = img.width;
        let height = img.height;
        if (width > maxSize || height > maxSize) {
            if (width > height) {
                height = Math.round(height * (maxSize / width));
                width = maxSize;
            } else {
                width = Math.round(width * (maxSize / height));
                height = maxSize;
            }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
}

function renderGrid() {
    grid.innerHTML = '';
    grid.classList.remove('is-empty-state');
    if (!currentSessionName && imagesData.length === 0) {
        grid.classList.add('is-empty-state');
        grid.innerHTML = `
            <div class="empty-hand-state">
                <div class="empty-hand-animation" aria-hidden="true">
                    <div class="finger"></div>
                    <div class="finger"></div>
                    <div class="finger"></div>
                    <div class="finger"></div>
                    <div class="palm"></div>
                    <div class="thumb"></div>
                </div>
                <div class="empty-hand-title">Esperando a que subas fotos o selecciones una sesión</div>
                <div class="empty-hand-copy">Cuando cargues imágenes aquí o abras una sesión, empezamos a trabajar en el informe.</div>
            </div>
        `;
        updateImageCounter();
        if (typeof window.updateScrollBtns === 'function') {
            setTimeout(() => window.updateScrollBtns(), 0);
        }
        return;
    }
    imagesData.forEach((imageData, idx) => {
        imageData.index = imageStartNumber + idx;
        createImageBox(imageData, idx);
    });
    updateImageCounter(); // <-- Siempre actualiza el contador tras renderizar
    // --- NUEVO: Si está en modo selección rápida, re-aplicar handlers ---
    if (window.quickStateMode) {
        applyQuickStateHandlers();
    }
    if (typeof window.updateScrollBtns === 'function') {
        setTimeout(() => window.updateScrollBtns(), 0);
    }
}

function createImageBox(imageData, idx) {
    const div = document.createElement('div');
    div.className = `image-box image-enter ${getCardStatusClass(imageData.status)}`.trim();
    div.setAttribute('draggable', 'true');
    div.setAttribute('data-index', idx);
    div.addEventListener('dragstart', function(e) {
        isInternalDrag = true;        handleDragStart.call(this, e);
    });
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('dragleave', handleDragLeave);
    div.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over-animated');
        const indicator = this.querySelector('.drop-indicator');
        if (indicator) indicator.style.display = 'none';
        // Si el drop contiene archivos (imágenes) Y NO es drag interno, reemplazar la imagen de esta tarjeta (optimizada)
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0 && !isInternalDrag) {
            const file = e.dataTransfer.files[0];
            if (file.type && file.type.startsWith('image/')) {
                const validationError = validateImageFile(file);
                if (validationError) {
                    showToast(validationError, 'error');
                    return;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    resizeImage(ev.target.result, 1024, (resizedDataUrl) => {
                        imagesData[idx].src = resizedDataUrl;
                        renderGrid();
                        updateImageCounter();
                    });
                };
                reader.readAsDataURL(file);
                return; // Importante: no ejecutar reordenamiento si es archivo
            }
        }
        // Si no, es un reordenamiento normal
        handleDrop.call(this, e);
    });
    div.addEventListener('dragend', function(e) {
        isInternalDrag = false;        handleDragEnd.call(this, e);
    });
    const shouldShowImageLoader = !!imageData.src && !loadedImagePreviewSources.has(imageData.src);
    div.innerHTML = `
    <button class="remove-image-btn" title="Eliminar imagen" onclick="removeImage(${idx}, event)">×</button>
    <div class="image-container ${shouldShowImageLoader ? 'image-container-loading' : ''}" style="position:relative;">
        <div class="image-loading-state ${shouldShowImageLoader ? '' : 'is-hidden'}" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" height="200" width="200" viewBox="0 0 200 200" class="image-pencil-loader">
                <defs>
                    <clipPath id="pencil-eraser-${idx}">
                        <rect height="30" width="30" ry="5" rx="5"></rect>
                    </clipPath>
                </defs>
                <circle transform="rotate(-113,100,100)" stroke-linecap="round" stroke-dashoffset="439.82" stroke-dasharray="439.82 439.82" stroke-width="2" stroke="#111111" fill="none" r="70" class="image-pencil-loader__stroke"></circle>
                <g transform="translate(100,100)" class="image-pencil-loader__rotate">
                    <g fill="none">
                        <circle transform="rotate(-90)" stroke-dashoffset="402" stroke-dasharray="402.12 402.12" stroke-width="30" stroke="hsl(223,90%,50%)" r="64" class="image-pencil-loader__body1"></circle>
                        <circle transform="rotate(-90)" stroke-dashoffset="465" stroke-dasharray="464.96 464.96" stroke-width="10" stroke="hsl(223,90%,60%)" r="74" class="image-pencil-loader__body2"></circle>
                        <circle transform="rotate(-90)" stroke-dashoffset="339" stroke-dasharray="339.29 339.29" stroke-width="10" stroke="hsl(223,90%,40%)" r="54" class="image-pencil-loader__body3"></circle>
                    </g>
                    <g transform="rotate(-90) translate(49,0)" class="image-pencil-loader__eraser">
                        <g class="image-pencil-loader__eraser-skew">
                            <rect height="30" width="30" ry="5" rx="5" fill="hsl(223,90%,70%)"></rect>
                            <rect clip-path="url(#pencil-eraser-${idx})" height="30" width="5" fill="hsl(223,90%,60%)"></rect>
                            <rect height="20" width="30" fill="hsl(223,10%,90%)"></rect>
                            <rect height="20" width="15" fill="hsl(223,10%,70%)"></rect>
                            <rect height="20" width="5" fill="hsl(223,10%,80%)"></rect>
                            <rect height="2" width="30" y="6" fill="hsla(223,10%,10%,0.2)"></rect>
                            <rect height="2" width="30" y="13" fill="hsla(223,10%,10%,0.2)"></rect>
                        </g>
                    </g>
                    <g transform="rotate(-90) translate(49,-30)" class="image-pencil-loader__point">
                        <polygon points="15 0,30 30,0 30" fill="hsl(33,90%,70%)"></polygon>
                        <polygon points="15 0,6 30,0 30" fill="hsl(33,90%,50%)"></polygon>
                        <polygon points="15 0,20 10,10 10" fill="hsl(223,10%,10%)"></polygon>
                    </g>
                </g>
            </svg>
        </div>
        <img src="${imageData.src}" alt="Imagen ${imageData.index}" style="cursor:crosshair;" class="img-cropper-trigger ${shouldShowImageLoader ? 'is-loading' : ''}" data-idx="${idx}" />
    </div>
    <div class="image-label-desc-row">
        <div class="image-label">Foto ${imageData.index}</div>
        <textarea class="description" placeholder="Descripción de la inspección..." 
                  onchange="updateImageData(${idx}, 'description', this.value)">${imageData.description || ''}</textarea>
    </div>
    <select class="status-select" onchange="updateImageData(${idx}, 'status', this.value); updateSelectStyle(this)">
        <option value="">Seleccionar estado</option>
        <option value="verde" ${imageData.status === 'verde' ? 'selected' : ''}>🟢 Buen estado</option>
        <option value="amarillo" ${imageData.status === 'amarillo' ? 'selected' : ''}>🟡 Observaciones de mejora</option>
        <option value="rojo" ${imageData.status === 'rojo' ? 'selected' : ''}>🔴 No conformidad. Requiere intervención</option>
    </select>
    <div class="drop-indicator"></div>
    `;
    // Solo abrir cropper si se hace click en la imagen, no en textarea ni select
    const previewImg = div.querySelector('.img-cropper-trigger');
    const imageContainer = div.querySelector('.image-container');
    const imageLoader = div.querySelector('.image-loading-state');
    const imageLoaderStartedAt = Date.now();
    const finishPreviewLoad = () => {
        const elapsed = Date.now() - imageLoaderStartedAt;
        const remaining = Math.max(0, 5000 - elapsed);
        const revealImage = () => {
            if (imageData.src) {
                loadedImagePreviewSources.add(imageData.src);
            }
            previewImg.classList.remove('is-loading');
            imageContainer.classList.remove('image-container-loading');
            if (imageLoader) imageLoader.classList.add('is-hidden');
        };

        if (remaining > 0) {
            setTimeout(revealImage, remaining);
        } else {
            revealImage();
        }
    };
    previewImg.onclick = function(e) {
        if (!window.quickStateMode) showImageCropper(idx);
        e.stopPropagation();
    };
    if (!shouldShowImageLoader) {
        finishPreviewLoad();
    } else if (previewImg.complete && previewImg.naturalWidth > 0) {
        requestAnimationFrame(finishPreviewLoad);
    } else {
        previewImg.addEventListener('load', finishPreviewLoad, { once: true });
        previewImg.addEventListener('error', finishPreviewLoad, { once: true });
    }
    updateSelectStyle(div.querySelector('.status-select'));
    grid.appendChild(div);
}

// --- Cropper: abrir desde miniatura ---
window.showImageCropper = function(idx) {
    croppingIdx = idx;
    cropperRotation = 0;
    cropStart = null;
    cropEnd = null;
    cropping = false;
    cropperImg = new window.Image();
    cropperImg.onload = function() {
        drawCropperImage();
    };
    cropperImg.src = imagesData[idx].src;
    if (cropperModal) {
        cropperModal.style.display = 'flex';
    }
};

let dragSrcIdx = null;
let autoScrollInterval = null;

function handleDragStart(e) {
    dragSrcIdx = Number(this.getAttribute('data-index'));
    this.style.opacity = '0.4';
    // Activar auto-scroll
    document.addEventListener('dragover', handleAutoScroll);
}

function handleDragOver(e) {
    e.preventDefault();
    this.classList.add('drag-over-animated');
    // Mostrar indicador visual
    const indicator = this.querySelector('.drop-indicator');
    if (indicator) {
        indicator.style.display = 'block';
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over-animated');
    const indicator = this.querySelector('.drop-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over-animated');
    const indicator = this.querySelector('.drop-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
    const targetIdx = Number(this.getAttribute('data-index'));
    if (dragSrcIdx !== null && dragSrcIdx !== targetIdx) {
        const moved = imagesData.splice(dragSrcIdx, 1)[0];
        imagesData.splice(targetIdx, 0, moved);
        renderGrid();
    }
}

function handleDragEnd(e) {
    this.style.opacity = '';
    document.querySelectorAll('.image-box').forEach(box => {
        box.style.border = '2px solid #ecf0f1';
        box.classList.remove('drag-over-animated');
        const indicator = box.querySelector('.drop-indicator');
        if (indicator) indicator.style.display = 'none';
    });
    dragSrcIdx = null;
    // Desactivar auto-scroll
    document.removeEventListener('dragover', handleAutoScroll);
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
}

function handleAutoScroll(e) {
    const scrollMargin = 60; // px desde el borde
    const scrollSpeed = 18; // px por frame
    const y = e.clientY;
    const winHeight = window.innerHeight;
    if (y < scrollMargin) {
        // Scroll up
        if (!autoScrollInterval) {
            autoScrollInterval = setInterval(() => {
                window.scrollBy(0, -scrollSpeed);
            }, 16);
        }
    } else if (y > winHeight - scrollMargin) {
        // Scroll down
        if (!autoScrollInterval) {
            autoScrollInterval = setInterval(() => {
                window.scrollBy(0, scrollSpeed);
            }, 16);
        }
    } else {
        // Stop scrolling
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }
}

// --- Lógica para exportar a Word ---
async function generateWord(forceExport) {
    syncDescriptionsFromDOM();
    // Validar antes de continuar
    if (!forceExport) {
        // Si hay imágenes incompletas, showFancyAlert detiene el flujo
        const valid = validateBeforeExport(() => generateWord(true));
        if (!valid) return; // Detener si hay imágenes incompletas y el usuario no ha elegido continuar
    }

    // Verificar múltiples formas de acceso a la librería
    const docxLib = window.docx || window.Docx || (window.docxjs && window.docxjs.docx);
    
    if (!docxLib) {
        // Intentar cargar la librería de forma alternativa
        try {
            await loadDocxLibrary();
        } catch (error) {
            await showDecisionDialog({
                title: 'No se pudo cargar la librería',
                message: 'Verifica tu conexión a internet y recarga la página para generar el reporte.',
                confirmText: 'Entendido',
                tone: 'danger',
                showCancel: false,
                icon: '!'
            });
            return;
        }
    }

    if (imagesData.length === 0) {
        await showDecisionDialog({
            title: 'No hay imágenes cargadas',
            message: 'Carga al menos una imagen antes de generar el reporte.',
            confirmText: 'Entendido',
            tone: 'warning',
            showCancel: false,
            icon: '!'
        });
        return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ Generando...';
    showExportLoader('Generando reporte Word', 'Estamos armando el documento con tus imágenes...');
    const minExportLoaderDelay = new Promise((resolve) => setTimeout(resolve, 3500));

    try {
        const finalDocx = window.docx || window.Docx || docxLib;
        const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, SectionType } = finalDocx;

        const sections = [];
        const imagesPerPage = 9;
        const totalPages = Math.ceil(imagesData.length / imagesPerPage);

        for (let page = 0; page < totalPages; page++) {
            const children = [];
            // Título principal SIN fondo
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "REPORTE FOTOGRÁFICO DE INSPECCIÓN",
                            bold: true,
                            size: 28,
                            color: "000000",
                            font: "Tahoma"
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                })
            );

            // Texto "Convenciones:" debajo del título, alineado a la izquierda
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Convenciones:",
                            bold: true,
                            size: 20,
                            color: "000000",
                            font: "Tahoma"
                        })
                    ],
                    alignment: AlignmentType.LEFT,
                    spacing: { after: 100 }
                })
            );

            // Tabla horizontal SOLO con las 3 convenciones
            const convencionesTable = new Table({
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({ 
                                                text: "🟢 Buen estado", 
                                                size: 16, 
                                                color: "FFFFFF", 
                                                font: "Tahoma" 
                                            })
                                        ],
                                        alignment: AlignmentType.CENTER
                                    })
                                ],
                                shading: { fill: "27AE60" },
                                width: { size: 33.33, type: WidthType.PERCENTAGE },
                                margins: { top: 200, bottom: 200, left: 200, right: 200 }
                            }),
                            new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({ 
                                                text: "🟡 Observaciones de mejora", 
                                                size: 16, 
                                                color: "000000", 
                                                font: "Tahoma" 
                                            })
                                        ],
                                        alignment: AlignmentType.CENTER
                                    })
                                ],
                                shading: { fill: "F1C40F" },
                                width: { size: 33.33, type: WidthType.PERCENTAGE },
                                margins: { top: 200, bottom: 200, left: 200, right: 200 }
                            }),
                            new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({ 
                                                text: "🔴 No conformidad. Requiere intervención.", 
                                                size: 16, 
                                                color: "FFFFFF", 
                                                font: "Tahoma" 
                                            })
                                        ],
                                        alignment: AlignmentType.CENTER
                                    })
                                ],
                                shading: { fill: "E74C3C" },
                                width: { size: 33.33, type: WidthType.PERCENTAGE },
                                margins: { top: 200, bottom: 200, left: 200, right: 200 }
                            })
                        ]
                    })
                ],
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
                    bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
                    left: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
                    right: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
                }
            });

            children.push(convencionesTable);

            // Espacio entre convenciones y tabla principal
            children.push(
                new Paragraph({
                    children: [new TextRun({ text: "", font: "Tahoma" })],
                    spacing: { after: 400 }
                })
            );

            // Crear la tabla 3x3 (IMAGEN ARRIBA, DESCRIPCIÓN ABAJO)
            const rows = [];
            for (let i = 0; i < 3; i++) {
                const imageRowCells = [];
                const descRowCells = [];
                for (let j = 0; j < 3; j++) {
                    const globalIndex = page * imagesPerPage + (i * 3 + j);
                    if (globalIndex < imagesData.length) {
                        const imageData = imagesData[globalIndex];
                        // --- CELDA DE IMAGEN ---
                        let imageCell;
                        try {
                            const imageBuffer = await imageSourceToArrayBuffer(imageData.src);
                            imageCell = new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new ImageRun({
                                                data: imageBuffer,
                                                transformation: {
                                                    width: 160,
                                                    height: 200
                                                }
                                            })
                                        ],
                                        alignment: AlignmentType.CENTER,
                                        spacing: { after: 100 }
                                    })
                                ],
                                verticalAlign: "center",
                                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                                width: { size: 33.33, type: WidthType.PERCENTAGE }
                            });
                        } catch (error) {
                            imageCell = new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({ text: "[Error al cargar imagen]", color: "FF0000", italics: true, font: "Tahoma" })
                                        ],
                                        alignment: AlignmentType.CENTER
                                    })
                                ],
                                width: { size: 33.33, type: WidthType.PERCENTAGE }
                            });
                        }
                        // --- CELDA DE DESCRIPCIÓN ---
                        let bgColor = "FFFFFF";
                        let textColor = "000000";
                        if (imageData.status === 'verde') {
                            bgColor = "27AE60";
                            textColor = "FFFFFF";
                        } else if (imageData.status === 'amarillo') {
                            bgColor = "F1C40F";
                            textColor = "000000";
                        } else if (imageData.status === 'rojo') {
                            bgColor = "E74C3C";
                            textColor = "FFFFFF";
                        }
                        const descriptionText = imageData.description || 
                            (imageData.status === 'verde' ? 'En buen estado' :
                             imageData.status === 'amarillo' ? 'Observaciones de mejora' :
                             imageData.status === 'rojo' ? 'No conformidad. Requiere intervención' :
                             'Sin descripción');
                        const descCell = new TableCell({
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: `Imagen ${imageStartNumber + globalIndex}`,
                                            bold: true,
                                            size: 16,
                                            color: textColor,
                                            font: "Tahoma"
                                        })
                                    ],
                                    alignment: AlignmentType.CENTER,
                                    spacing: { after: 100 },
                                    shading: { fill: bgColor }
                                }),
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: descriptionText,
                                            size: 16,
                                            color: textColor,
                                            font: "Tahoma"
                                        })
                                    ],
                                    alignment: AlignmentType.CENTER,
                                    shading: { fill: bgColor }
                                })
                            ],
                            verticalAlign: "center",
                            shading: { fill: bgColor },
                            width: { size: 33.33, type: WidthType.PERCENTAGE }
                        });
                        imageRowCells.push(imageCell);
                        descRowCells.push(descCell);
                    } else {
                        // Celdas vacías (imagen y descripción)
                        imageRowCells.push(new TableCell({
                            children: [new Paragraph({ text: "", font: "Tahoma" })],
                            width: { size: 33.33, type: WidthType.PERCENTAGE }
                        }));
                        descRowCells.push(new TableCell({
                            children: [new Paragraph({ text: "", font: "Tahoma" })],
                            width: { size: 33.33, type: WidthType.PERCENTAGE }
                        }));
                    }
                }
                rows.push(new TableRow({ children: imageRowCells }));
                rows.push(new TableRow({ children: descRowCells }));
            }
            // Agregar la tabla al children de la sección
            children.push(
                new Table({
                    rows: rows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                        left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                        right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
                    }
                })
            );
            // Agregar la sección (página)
            sections.push({
                properties: {
                    page: {
                        margin: {
                            top: 720,
                            right: 720,
                            bottom: 720,
                            left: 720
                        }
                    },
                    type: SectionType.NEXT_PAGE
                },
                children: children
            });
        }
        // Crear el documento con todas las secciones
        const doc = new Document({
            sections: sections
        });

        const blob = await Packer.toBlob(doc);
        await minExportLoaderDelay;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_fotografico_inspeccion_${new Date().toISOString().split('T')[0]}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showSuccessAlert('Reporte generado correctamente');

    } catch (error) {
        console.error('Error al generar el documento:', error);
        await minExportLoaderDelay;
        await showDecisionDialog({
            title: 'Error al generar el reporte',
            message: `Error al generar el documento: ${error.message}`,
            confirmText: 'Cerrar',
            tone: 'danger',
            showCancel: false,
            icon: '!'
        });
    } finally {
        hideExportLoader();
        generateBtn.disabled = false;
        generateBtn.textContent = '📄 Generar Reporte Word';
    }
}

window.generateWord = generateWord;

// Alerta moderna de éxito
function showSuccessAlert(message) {
    const old = document.getElementById('successAlertModal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'successAlertModal';
    modal.className = 'report-success-modal';
    modal.innerHTML = `
      <div class="report-success-card">
        <div class="report-success-icon">✓</div>
        <div class="report-success-title">${message}</div>
        <div class="report-success-subtitle">Tu reporte Word ya quedó listo para revisarse.</div>
        <button id="successAlertBtn" class="report-success-btn">Cerrar</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('successAlertBtn').onclick = () => {
        modal.remove();
    };
}

// --- Validación avanzada antes de exportar (bonita visualmente) ---
function validateBeforeExport(onContinue) {
    let missing = [];
    imagesData.forEach((img, idx) => {
        const noDesc = !img.description || img.description.trim() === '';
        const noStatus = !img.status || img.status.trim() === '';
        if (noDesc || noStatus) {
            missing.push({
                idx: idx + 1,
                noDesc,
                noStatus
            });
        }
    });
    if (missing.length > 0) {
        let message = '<ul style="text-align:left;max-height:180px;overflow:auto;padding-left:18px;">';
        missing.forEach(m => {
            message += `<li>Imagen ${m.idx}:`;
            if (m.noDesc && m.noStatus) message += ' falta descripción y estado';
            else if (m.noDesc) message += ' falta descripción';
            else if (m.noStatus) message += ' falta estado';
            message += '</li>';
        });
        message += '</ul>';
        showFancyAlert(message, onContinue);
        return false;
    }
    return true;
}

function showFancyAlert(message, onContinue) {
    // Elimina alertas previas
    const old = document.getElementById('fancyAlertModal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'fancyAlertModal';
    modal.className = 'report-warning-modal';
    modal.innerHTML = `
      <div class="report-warning-card">
        <div class="report-warning-icon">📝</div>
        <div class="report-warning-title">Faltan datos en algunas imágenes</div>
        <div class="report-warning-body">${message}</div>
        <div class="report-warning-actions">
          <button id="fancyAlertBtnContinue" class="report-warning-btn report-warning-btn-continue">Continuar</button>
          <button id="fancyAlertBtn" class="report-warning-btn report-warning-btn-edit">Editar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('fancyAlertBtn').onclick = () => {
        modal.remove();
    };
    document.getElementById('fancyAlertBtnContinue').onclick = () => {
        modal.remove();
        if (typeof onContinue === 'function') onContinue();
    };
}

// --- Sincronizar datos del DOM antes de exportar ---
function syncDescriptionsFromDOM() {
    document.querySelectorAll('.image-box').forEach((box, idx) => {
        const desc = box.querySelector('textarea.description');
        const sel = box.querySelector('select.status-select');
        if (desc) imagesData[idx].description = desc.value;
        if (sel) imagesData[idx].status = sel.value;
    });
}

// Utilidad para convertir base64 a ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64.split(',')[1]);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

async function imageSourceToArrayBuffer(src) {
    if (typeof src !== 'string' || !src) {
        throw new Error('La imagen no tiene una fuente válida.');
    }

    if (src.startsWith('data:image/')) {
        return base64ToArrayBuffer(src);
    }

    const response = await fetch(src);
    if (!response.ok) {
        throw new Error(`No se pudo descargar la imagen (${response.status}).`);
    }

    return await response.arrayBuffer();
}

// --- Cropper globales ---
let cropperModal = document.getElementById('cropperModal');
let cropperCanvas = document.getElementById('cropperCanvas');
let cropperCtx = cropperCanvas ? cropperCanvas.getContext('2d') : null;
let cropperImg = new window.Image();
let croppingIdx = null;
let cropStart = null, cropEnd = null, cropping = false;
let cropperOriginal = null; // Guarda el original para revertir
let cropperRotation = 0; // 0, 90, 180, 270

// --- Cropper: agregar botón de girar 90° y confirmar giro ---
if (document.getElementById('cropperModal')) {
    const cropperBtns = document.querySelector('.cropper-btns');
    if (cropperBtns && !document.getElementById('cropperRotateBtn')) {
        const rotateBtn = document.createElement('button');
        rotateBtn.id = 'cropperRotateBtn';
        rotateBtn.textContent = 'Girar 90°';
        rotateBtn.style.marginRight = '8px';
        rotateBtn.onclick = function() {
            if (typeof cropperRotation === 'undefined') window.cropperRotation = 0;
            cropperRotation = (cropperRotation + 90) % 360;
            if (typeof drawCropperImage === 'function') drawCropperImage();
            updateConfirmRotateBtn();
        };
        cropperBtns.insertBefore(rotateBtn, cropperBtns.firstChild);
    }
    // Botón Confirmar giro
    if (!document.getElementById('cropperConfirmRotateBtn')) {
        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'cropperConfirmRotateBtn';
        confirmBtn.textContent = 'Confirmar giro';
        confirmBtn.style.display = 'none';
        confirmBtn.style.marginRight = '8px';
        confirmBtn.onclick = function() {
            // Guardar imagen girada completa
            let angle = cropperRotation % 360;
            let w = cropperImg.naturalWidth;
            let h = cropperImg.naturalHeight;
            let canvasW = (angle === 90 || angle === 270) ? h : w;
            let canvasH = (angle === 90 || angle === 270) ? w : h;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasW;
            tempCanvas.height = canvasH;
            const tctx = tempCanvas.getContext('2d');
            tctx.save();
            if (angle === 90) {
                tctx.translate(canvasW, 0);
                tctx.rotate(Math.PI / 2);
            } else if (angle === 180) {
                tctx.translate(canvasW, canvasH);
                tctx.rotate(Math.PI);
            } else if (angle === 270) {
                tctx.translate(0, canvasH);
                tctx.rotate(3 * Math.PI / 2);
            }
            tctx.drawImage(cropperImg, 0, 0, w, h);
            tctx.restore();
            imagesData[croppingIdx].src = tempCanvas.toDataURL('image/png');
            renderGrid();
            cropperModal.style.display = 'none';
        };
        cropperBtns.insertBefore(confirmBtn, cropperBtns.firstChild.nextSibling);
    }
}
// Función para mostrar/ocultar el botón Confirmar giro
function updateConfirmRotateBtn() {
    const btn = document.getElementById('cropperConfirmRotateBtn');
    if (!btn) return;
    if (cropperRotation % 360 !== 0) {
        btn.style.display = '';
    } else {
        btn.style.display = 'none';
    }
}
// Llamar al abrir el cropper
function openCropper(idx) {
    croppingIdx = idx;
    cropperRotation = 0;
    cropperImg = new window.Image();
    cropperImg.onload = function() {
        drawCropperImage();
        cropStart = null;
        cropEnd = null;
        cropperModal.style.display = 'flex';
        updateConfirmRotateBtn();
    };
    cropperImg.src = imagesData[idx].src;
}

// --- drawCropperImage con recorte y rotación ---
function drawCropperImage() {
    let w = cropperImg.naturalWidth;
    let h = cropperImg.naturalHeight;
    let angle = cropperRotation % 360;
    let canvasW = (angle === 90 || angle === 270) ? h : w;
    let canvasH = (angle === 90 || angle === 270) ? w : h;
    cropperCanvas.width = canvasW;
    cropperCanvas.height = canvasH;
    cropperCtx.clearRect(0, 0, canvasW, canvasH);
    cropperCtx.save();
    if (angle === 90) {
        cropperCtx.translate(canvasW, 0);
        cropperCtx.rotate(Math.PI / 2);
    } else if (angle === 180) {
        cropperCtx.translate(canvasW, canvasH);
        cropperCtx.rotate(Math.PI);
    } else if (angle === 270) {
        cropperCtx.translate(0, canvasH);
        cropperCtx.rotate(3 * Math.PI / 2);
    }
    cropperCtx.drawImage(cropperImg, 0, 0, w, h);
    cropperCtx.restore();
    // Dibuja el rectángulo de recorte si está activo
    if (cropStart && cropEnd) {
        cropperCtx.save();
        cropperCtx.strokeStyle = '#3498db';
        cropperCtx.lineWidth = 3;
        cropperCtx.setLineDash([8, 6]);
        cropperCtx.strokeRect(
            cropStart.x,
            cropStart.y,
            cropEnd.x - cropStart.x,
            cropEnd.y - cropStart.y
        );
        cropperCtx.setLineDash([]);
        cropperCtx.restore();
    }
}

// --- Eventos de recorte sobre el canvas ---
if (cropperCanvas) {
    let scaleX = 1, scaleY = 1;
    function updateScale() {
        scaleX = cropperCanvas.width / cropperCanvas.getBoundingClientRect().width;
        scaleY = cropperCanvas.height / cropperCanvas.getBoundingClientRect().height;
    }
    cropperCanvas.onmousedown = function(e) {
        updateScale();
        cropping = true;
        const rect = cropperCanvas.getBoundingClientRect();
        cropStart = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
        cropEnd = null;
    };
    cropperCanvas.onmousemove = function(e) {
        if (!cropping || !cropStart) return;
        updateScale();
        const rect = cropperCanvas.getBoundingClientRect();
        cropEnd = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
        drawCropperImage();
    };
    cropperCanvas.onmouseup = function(e) {
        updateScale();
        cropping = false;
        const rect = cropperCanvas.getBoundingClientRect();
        cropEnd = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
        drawCropperImage();
    };
    // --- SOPORTE TOUCH SOLO EN EL MODAL CROPPER ---
    cropperCanvas.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        updateScale();
        cropping = true;
        const rect = cropperCanvas.getBoundingClientRect();
        const touch = e.touches[0];
        cropStart = {
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY
        };
        cropEnd = null;
        e.preventDefault();
    }, { passive: false });
    cropperCanvas.addEventListener('touchmove', function(e) {
        if (!cropping || !cropStart || e.touches.length !== 1) return;
        updateScale();
        const rect = cropperCanvas.getBoundingClientRect();
        const touch = e.touches[0];
        cropEnd = {
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY
        };
        drawCropperImage();
        e.preventDefault();
    }, { passive: false });
    cropperCanvas.addEventListener('touchend', function(e) {
        if (!cropping || !cropStart) return;
        updateScale();
        cropping = false;
        const rect = cropperCanvas.getBoundingClientRect();
        // Usar el último touch si existe, si no, usar cropEnd anterior
        let touch = (e.changedTouches && e.changedTouches[0]) || null;
        if (touch) {
            cropEnd = {
                x: (touch.clientX - rect.left) * scaleX,
                y: (touch.clientY - rect.top) * scaleY
            };
        }
        drawCropperImage();
        e.preventDefault();
    }, { passive: false });
}

// --- Recorte correcto considerando la rotación ---
if (document.getElementById('cropperOkBtn')) {
    document.getElementById('cropperOkBtn').onclick = function() {
        let angle = cropperRotation % 360;
        // Si NO hay recorte seleccionado, guardar la imagen completa girada
        if (!cropStart || !cropEnd) {
            // Crear canvas del tamaño correcto según rotación
            let w = cropperImg.naturalWidth;
            let h = cropperImg.naturalHeight;
            let canvasW = (angle === 90 || angle === 270) ? h : w;
            let canvasH = (angle === 90 || angle === 270) ? w : h;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasW;
            tempCanvas.height = canvasH;
            const tctx = tempCanvas.getContext('2d');
            tctx.save();
            if (angle === 90) {
                tctx.translate(canvasW, 0);
                tctx.rotate(Math.PI / 2);
            } else if (angle === 180) {
                tctx.translate(canvasW, canvasH);
                tctx.rotate(Math.PI);
            } else if (angle === 270) {
                tctx.translate(0, canvasH);
                tctx.rotate(3 * Math.PI / 2);
            }
            tctx.drawImage(cropperImg, 0, 0, w, h);
            tctx.restore();
            imagesData[croppingIdx].src = tempCanvas.toDataURL('image/png');
            renderGrid();
            cropperModal.style.display = 'none';
            return;
        }
        // Si hay selección de recorte, proceder con el recorte normal
        let x = Math.min(cropStart.x, cropEnd.x);
        let y = Math.min(cropStart.y, cropEnd.y);
        let w = Math.abs(cropEnd.x - cropStart.x);
        let h = Math.abs(cropEnd.y - cropStart.y);
        if (w < 10 || h < 10) return;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tctx = tempCanvas.getContext('2d');
        tctx.save();
        if (angle === 0) {
            tctx.drawImage(cropperImg, x, y, w, h, 0, 0, w, h);
        } else if (angle === 90) {
            tctx.translate(w, 0);
            tctx.rotate(Math.PI / 2);
            tctx.drawImage(cropperImg, y, cropperImg.naturalWidth - x - w, h, w, 0, 0, h, w);
        } else if (angle === 180) {
            tctx.translate(w, h);
            tctx.rotate(Math.PI);
            tctx.drawImage(cropperImg, cropperImg.naturalWidth - x - w, cropperImg.naturalHeight - y - h, w, h, 0, 0, w, h);
        } else if (angle === 270) {
            tctx.translate(0, h);
            tctx.rotate(3 * Math.PI / 2);
            tctx.drawImage(cropperImg, cropperImg.naturalHeight - y - h, x, h, w, 0, 0, h, w);
        }
        tctx.restore();
        imagesData[croppingIdx].src = tempCanvas.toDataURL('image/png');
        renderGrid();
        cropperModal.style.display = 'none';
    };
}

// --- Botón cancelar/cerrar cropper ---
if (document.getElementById('cropperCancelBtn')) {
    document.getElementById('cropperCancelBtn').onclick = function() {
        cropperModal.style.display = 'none';
    };
}

// --- Cerrar cropper al hacer click fuera del modal ---
if (cropperModal) {
    cropperModal.addEventListener('mousedown', function(e) {
        if (e.target === cropperModal) {
            cropperModal.style.display = 'none';
        }
    });
}

// --- Estilo visual para drag & drop zona ---
const style = document.createElement('style');
style.innerHTML = `
.drag-over-dropzone {
  box-shadow: 0 0 0 4px #2980b9, 0 0 32px #6dd5fa99;
  background: #eaf6ff !important;
  transition: box-shadow 0.2s, background 0.2s;
}
#imageCounter {
  text-align: right;
  margin: 10px 30px 0 0;
  font-weight: bold;
  color: #2c3e50;
}
`;
document.head.appendChild(style);

// --- Mantener contador sincronizado sin auto-guardar al renderizar ---
const originalRenderGrid = renderGrid;
renderGrid = function() {
    originalRenderGrid.apply(this, arguments);
    updateImageCounter();
};

// --- Drag & Drop global para cargar imagen en cualquier parte de la pantalla ---
let globalDropOverlay = null;
let isInternalDrag = false; // Nuevo: para distinguir drag interno

function showGlobalDropOverlay() {
    if (!globalDropOverlay) {
        globalDropOverlay = document.createElement('div');
        globalDropOverlay.id = 'globalDropOverlay';
        globalDropOverlay.style.position = 'fixed';
        globalDropOverlay.style.top = '0';
        globalDropOverlay.style.left = '0';
        globalDropOverlay.style.width = '100vw';
        globalDropOverlay.style.height = '100vh';
        globalDropOverlay.style.background = 'rgba(52, 152, 219, 0.13)';
        globalDropOverlay.style.zIndex = '100000';
        globalDropOverlay.style.display = 'flex';
        globalDropOverlay.style.alignItems = 'center';
        globalDropOverlay.style.justifyContent = 'center';
        globalDropOverlay.style.pointerEvents = 'none';
        globalDropOverlay.innerHTML = `<div style="background:rgba(255,255,255,0.92);padding:38px 48px;border-radius:22px;box-shadow:0 8px 32px #2980b933;font-size:1.5rem;color:#2980b9;font-weight:bold;display:flex;align-items:center;gap:18px;"><span style='font-size:2.2rem;'>📷</span> Suelta aquí para cargar imagen</div>`;
        document.body.appendChild(globalDropOverlay);
    }
    globalDropOverlay.style.display = 'flex';
}
function hideGlobalDropOverlay() {
    if (globalDropOverlay) globalDropOverlay.style.display = 'none';
}

// Eventos globales para drag & drop
let dragCounter = 0;
document.addEventListener('dragenter', function(e) {
    // Solo mostrar overlay si NO es drag interno
    if (e.dataTransfer && e.dataTransfer.types.includes('Files') && !isInternalDrag) {
        dragCounter++;
        showGlobalDropOverlay();
    }
});
document.addEventListener('dragleave', function(e) {
    if (e.dataTransfer && e.dataTransfer.types.includes('Files') && !isInternalDrag) {
        dragCounter--;
        if (dragCounter <= 0) {
            hideGlobalDropOverlay();
            dragCounter = 0;
        }
    }
});
document.addEventListener('dragover', function(e) {
    if (e.dataTransfer && e.dataTransfer.types.includes('Files') && !isInternalDrag) {
        e.preventDefault();
    }
});
document.addEventListener('drop', function(e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0 && !isInternalDrag) {
        e.preventDefault();
        hideGlobalDropOverlay();
        dragCounter = 0;
        // Si el drop NO es sobre una tarjeta, agregar la imagen al grid
        const isCard = e.target.closest && e.target.closest('.image-box');
        if (!isCard) {
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) {
                // Simular input file
                handleImageUpload({ target: { files } });
            }
        }
    }
});

// --- UI y lógica para manejo de sesiones ---
async function saveSessionToDB() {
    const name = document.getElementById('sessionNameInput').value.trim();
    if (!name) {
        showToast('Escribe un nombre para la sesión.', 'error');
        return;
    }
    const wasLibraryWorkspace = !currentSessionName;
    const libraryImageIdsToCleanup = wasLibraryWorkspace
        ? imagesData
            .filter((img) => img && img._scope === 'library' && img._id)
            .map((img) => img._id)
        : [];
    syncDescriptionsFromDOM();
    const images = imagesData.map(buildSessionImagePayload);
    showSaveLoader('Guardando sesión...', `Estamos guardando la sesión "${name}".`);
    try {
        const res = await apiFetch('/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, images })
        });

        if (!res.ok) {
            const errorText = await res.text();
            showToast(`No se pudo guardar la sesión. ${errorText}`, 'error');
            return;
        }

        const savedSession = await res.json();
        if (libraryImageIdsToCleanup.length > 0) {
            await Promise.allSettled(
                libraryImageIdsToCleanup.map((id) =>
                    apiFetch(`/image/${id}`, { method: 'DELETE' })
                )
            );
        }
        if (savedSession && Array.isArray(savedSession.images)) {
            imagesData = savedSession.images.map(img => ({
                ...img,
                imageData: '',
                src: getImageDisplaySource(img),
                _scope: 'session'
            }));
            imageCount = imagesData.length;
            renderGrid();
            updateImageCounter();
        }

        setCurrentSession(name);
        markSessionDirty(false);
        await loadSessionList(name);
        fetchStorageUsage();
        showToast('Sesión guardada correctamente.', 'success');
    } finally {
        await hideSaveLoader();
    }
}

async function loadSessionList(selectedName = '') {
    const res = await apiFetch('/sessions');
    if (!res.ok) {
        showToast('No se pudo cargar la lista de sesiones.', 'error');
        return;
    }
    const sessions = await res.json();
    sessionSummaries = Array.isArray(sessions) ? sessions : [];
    const missingPhotoCount = sessionSummaries.some((session) => !Number.isFinite(Number(session.photoCount)));

    if (missingPhotoCount && sessionSummaries.length > 0) {
        sessionSummaries = await Promise.all(sessionSummaries.map(async (session) => {
            try {
                const detailRes = await apiFetch(`/session/${encodeURIComponent(session.name)}?includeImageData=false`);
                if (!detailRes.ok) {
                    return { ...session, photoCount: Number(session.photoCount || 0) };
                }
                const detail = await detailRes.json();
                const photoCount = Array.isArray(detail.images) ? detail.images.length : 0;
                return { ...session, photoCount };
            } catch (error) {
                return { ...session, photoCount: Number(session.photoCount || 0) };
            }
        }));
    }

    const select = document.getElementById('sessionList');
    select.innerHTML = '';
    // Agrega el espacio de trabajo sin sesión al inicio.
    const noSessionOpt = document.createElement('option');
    noSessionOpt.value = '';
    noSessionOpt.textContent = 'Sin sesión';
    select.appendChild(noSessionOpt);
    sessionSummaries.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = `${s.name} (${new Date(s.createdAt).toLocaleString()})`;
        select.appendChild(opt);
    });

    const targetName = selectedName || currentSessionName;
    if (targetName && sessionSummaries.some(s => s.name === targetName)) {
        select.value = targetName;
    } else {
        select.value = '';
    }

    renderStorageSessionsDropdown();
    updateSessionActionLayout();
}

async function loadSessionFromDB(options = {}) {
    const select = document.getElementById('sessionList');
    const name = (options.sessionName || (select ? select.value : '') || '').trim();
    if (shouldConfirmSessionSwitch(name)) {
        const decision = await showDecisionDialog({
            title: 'Cambios sin guardar',
            message: 'No has guardado los cambios de esta sesión. ¿Seguro que quieres cambiar?',
            confirmText: 'Cambiar sin guardar',
            cancelText: 'Seguir editando',
            tertiaryText: 'Guardar y cambiar',
            tone: 'warning',
            icon: '!'
        });
        if (decision === 'tertiary') {
            try {
                await persistCurrentSessionChanges({ name: currentSessionName, silent: false, source: 'manual' });
            } catch (error) {
                if (select) {
                    select.value = currentSessionName || '';
                }
                updateSessionActionLayout();
                return;
            }
        } else if (!decision) {
            if (select) {
                select.value = currentSessionName || '';
            }
            updateSessionActionLayout();
            return;
        }
        await discardUnsavedSessionDrafts();
        markSessionDirty(false);
    }

    if (!name) {
        if (currentSessionName) {
            await switchToLibraryWorkspace();
        } else {
            setCurrentSession('');
            updateSessionActionLayout();
        }
        return;
    }
    showAppLoader(options.loaderMessage || 'Cargando sesión...');
    try {
        const res = await apiFetch(`/session/${encodeURIComponent(name)}?includeImageData=false`);
        if (!res.ok) {
            if (!options.silent) {
                showToast('No se pudo cargar la sesión.', 'error');
            }
            return;
        }

        const session = await res.json();
        const restoredDraft = options.forceServer ? false : restoreSessionDraftIntoState(name);
        if (!restoredDraft) {
            imagesData = session.images.map(img => ({ ...img, imageData: '', src: getImageDisplaySource(img), _scope: 'session' }));
            imageCount = imagesData.length;
            imageStartNumber = 1;
        }
        setCurrentSession(name);
        if (!restoredDraft) {
            markSessionDirty(false);
        } else {
            updateCurrentSessionBanner();
        }
        renderGrid();
        updateImageCounter();
        if (!options.silent) {
            showToast(options.forceServer ? 'Se recuperó el último guardado de la sesión.' : (restoredDraft ? 'Sesión recuperada con cambios pendientes.' : 'Sesión cargada.'), 'info');
        }
    } finally {
        hideAppLoader();
    }
}

async function reloadLastSavedSessionState() {
    if (!currentSessionName) {
        showToast('Abre una sesión para recuperar su último guardado.', 'info');
        return;
    }

    const shouldReplace = hasUnsavedSessionChanges
        ? await showDecisionDialog({
            title: 'Recuperar último guardado',
            message: `Se perderán los cambios locales no guardados de la sesión "${currentSessionName}". ¿Quieres cargar el último guardado real?`,
            confirmText: 'Cargar último guardado',
            cancelText: 'Cancelar',
            tone: 'warning',
            icon: '↺'
        })
        : true;

    if (!shouldReplace) return;

    undoStack = [];
    clearSessionDraftCache(currentSessionName);
    hasUnsavedSessionChanges = false;
    nextSessionAutosaveAt = 0;
    await loadSessionFromDB({
        sessionName: currentSessionName,
        forceServer: true,
        silent: false,
        loaderMessage: 'Recuperando último guardado...'
    });
}

async function deleteSessionFromDB() {
    const select = document.getElementById('sessionList');
    const name = select.value;
    if (!name) {
        showToast('Selecciona una sesión.', 'error');
        return;
    }
    const confirmed = await showDecisionDialog({
        title: 'Borrar sesión',
        message: `Se eliminará la sesión "${name}" y sus imágenes guardadas. Esta acción no se puede deshacer.`,
        confirmText: 'Borrar',
        cancelText: 'Cancelar',
        tone: 'danger',
        icon: '×'
    });
    if (!confirmed) return;
    showDeleteLoader('Eliminando sesión...', `Estamos borrando la sesión "${name}".`);
    try {
        const res = await apiFetch(`/session/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (!res.ok) {
            showToast('No se pudo borrar la sesión.', 'error');
            return;
        }
        const deletedCurrentSession = currentSessionName === name;
        if (currentSessionName === name) {
            setCurrentSession('');
        }
        clearSessionDraftCache(name);
        markSessionDirty(false);
        await loadSessionList('');
        if (deletedCurrentSession) {
            await switchToLibraryWorkspace();
        } else {
            renderGrid();
            updateImageCounter();
        }
        fetchStorageUsage();
        showToast('Sesión borrada.', 'info');
    } finally {
        await hideDeleteLoader();
    }
}

async function clearAllSessions() {
    const confirmed = await showDecisionDialog({
        title: 'Eliminar base de datos',
        message: 'Se borrarán todas las sesiones guardadas. Esta acción no se puede deshacer.',
        confirmText: 'Eliminar todo',
        cancelText: 'Cancelar',
        tone: 'danger',
        icon: '×'
    });
    if (!confirmed) return;
    showDeleteLoader('Eliminando base de datos...', 'Estamos borrando todas las sesiones guardadas.');
    try {
        const res = await apiFetch('/sessions', { method: 'DELETE' });
        if (!res.ok) {
            showToast('No se pudieron borrar las sesiones.', 'error');
            return;
        }
        setCurrentSession('');
        try {
            Object.keys(localStorage)
                .filter((key) => key.startsWith(SESSION_DRAFT_STORAGE_PREFIX))
                .forEach((key) => localStorage.removeItem(key));
        } catch (error) {
            // Ignorar errores del caché local.
        }
        markSessionDirty(false);
        await loadSessionList();
        fetchStorageUsage();
        showToast('Todas las sesiones fueron borradas.', 'info');
    } finally {
        await hideDeleteLoader();
    }
}

async function clearAllUploadedImages() {
        const deletingSessionImages = Boolean(currentSessionName);
    const confirmed = await showDecisionDialog({
        title: deletingSessionImages ? 'Eliminar imágenes de esta sesión' : 'Eliminar imágenes de Sin sesión',
        message: deletingSessionImages
            ? `Se borrarán todas las fotos guardadas dentro de la sesión "${currentSessionName}". La sesión seguirá existiendo, pero quedará vacía.`
            : 'Se borrarán todas las fotos del espacio Sin sesión. Esta acción no se puede deshacer.',
        confirmText: 'Eliminar imágenes',
        cancelText: 'Cancelar',
        tone: 'danger',
        icon: '×'
    });
    if (!confirmed) return;
    showDeleteLoader(
        deletingSessionImages ? 'Eliminando imágenes...' : 'Limpiando imágenes...',
        deletingSessionImages
            ? `Estamos eliminando las imágenes de la sesión "${currentSessionName}".`
            : 'Estamos limpiando las imágenes cargadas en este espacio.'
    );
    try {
        const res = await apiFetch(
            deletingSessionImages
                ? `/session/${encodeURIComponent(currentSessionName)}/images`
                : '/images',
            { method: 'DELETE' }
        );
        if (!res.ok) {
            showToast('No se pudieron borrar las imágenes.', 'error');
            return;
        }

        if (currentSessionName) {
            await loadSessionFromDB({ sessionName: currentSessionName, silent: true, loaderMessage: 'Limpiando imágenes...' });
        } else {
            await loadSession();
        }
        updateImageCounter();
        fetchStorageUsage();
        showToast(deletingSessionImages ? 'Las imágenes de esta sesión fueron eliminadas.' : 'Las imágenes de Sin sesión fueron eliminadas.', 'info');
    } finally {
        await hideDeleteLoader();
    }
}

function removeOldSessionControls() {
    const old = document.getElementById('sessionControls');
    if (old) old.remove();
}

function addSessionControls() {
    removeOldSessionControls();
    document.getElementById('saveChangesBtn').onclick = handlePrimarySessionSave;
    document.getElementById('loadSessionBtn').onclick = loadSessionFromDB;
    document.getElementById('deleteSessionBtn').onclick = deleteSessionFromDB;
    document.getElementById('btn-clear-db').onclick = clearAllSessions;
    const sessionSelect = document.getElementById('sessionList');
    if (sessionSelect) {
        sessionSelect.addEventListener('change', () => {
            updateSessionActionLayout();
        });
    }
}

// Evento para el botón de selección rápida
const quickBtn = document.getElementById('quickStateBtn');
if (quickBtn) {
    quickBtn.onclick = function() {
        if (!window.quickStateMode) enterQuickStateMode();
    };
}

// --- Limpiar imágenes (botón Limpiar) ---
    const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.onclick = clearAllUploadedImages;
  }

  const reloadSavedBtn = document.getElementById('reloadSavedBtn');
  if (reloadSavedBtn) {
    reloadSavedBtn.onclick = reloadLastSavedSessionState;
  }

// --- Lógica para selección rápida de estado ---
window.quickStateMode = false;
window.quickStateSelected = null;

function getQuickStateVisual(state) {
    switch (state) {
        case 'verde':
            return { label: 'Buen estado', tone: 'success', icon: '●' };
        case 'amarillo':
            return { label: 'Observación', tone: 'warning', icon: '●' };
        case 'rojo':
            return { label: 'No conforme', tone: 'danger', icon: '●' };
        default:
            return { label: 'Limpiar estado', tone: 'clear', icon: '○' };
    }
}

function setQuickStateSelection(state) {
    window.quickStateSelected = state;
    document.querySelectorAll('.quick-state-chip').forEach((chip) => {
        chip.classList.toggle('is-selected', chip.dataset.state === state);
    });
}

async function applyQuickStateToImage(idx, state) {
    if (!imagesData[idx]) return;
    await window.updateImageData(idx, 'status', state);
    renderGrid();
}

// --- Modern Quick State Banner ---
function showQuickStateBanner() {
    // Eliminar banners previos
    let oldBanner = document.getElementById('quickStateBanner');
    if (oldBanner) oldBanner.remove();
    let oldOverlay = document.getElementById('quickStateOverlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'quickStateOverlay';
    overlay.className = 'quick-state-overlay';
    document.body.appendChild(overlay);

    const banner = document.createElement('div');
    banner.id = 'quickStateBanner';
    banner.className = 'quick-state-banner';
    banner.innerHTML = `
      <button id="quickStateCloseBtn" class="quick-state-close" title="Salir">×</button>
      <div class="quick-state-banner-title">
        <span class="quick-state-banner-bolt">⚡</span>
        <span>Estado rápido</span>
      </div>
      <div class="quick-state-chip-row">
        <button class="quick-state-chip quick-state-chip-success" id="quickStateVerde" data-state="verde" title="Buen estado"><span class="quick-state-chip-dot">●</span><span>Buen estado</span></button>
        <button class="quick-state-chip quick-state-chip-warning" id="quickStateAmarillo" data-state="amarillo" title="Observación"><span class="quick-state-chip-dot">●</span><span>Observación</span></button>
        <button class="quick-state-chip quick-state-chip-danger" id="quickStateRojo" data-state="rojo" title="No conformidad"><span class="quick-state-chip-dot">●</span><span>No conforme</span></button>
        <button class="quick-state-chip quick-state-chip-clear" id="quickStateClear" data-state="" title="Limpiar estado"><span class="quick-state-chip-dot">○</span><span>Limpiar</span></button>
      </div>
      <div class="quick-state-banner-actions">
        <button id="quickStateSelectAll" class="quick-state-apply-all" type="button">Aplicar a todas</button>
      </div>
    `;
    banner.onclick = function(e) { e.stopPropagation(); };
    overlay.appendChild(banner);

    setQuickStateSelection(null);
    document.getElementById('quickStateVerde').onclick = () => setQuickStateSelection('verde');
    document.getElementById('quickStateAmarillo').onclick = () => setQuickStateSelection('amarillo');
    document.getElementById('quickStateRojo').onclick = () => setQuickStateSelection('rojo');
    document.getElementById('quickStateClear').onclick = () => setQuickStateSelection('');
    document.getElementById('quickStateSelectAll').onclick = async function() {
        if (window.quickStateSelected === null || imagesData.length === 0) return;
        if (currentSessionName) {
            pushUndoState('Estado rápido en todas');
        }
        await Promise.all(imagesData.map((_, index) => applyQuickStateToImage(index, window.quickStateSelected)));
        showToast('Estado aplicado a todas las fotos.', 'success');
    };

    document.getElementById('quickStateCloseBtn').onclick = function(e) {
        e.stopPropagation();
        exitQuickStateMode();
    };
}

// Ocultar banner y overlay
function hideQuickStateBanner() {
    let banner = document.getElementById('quickStateBanner');
    if (banner) banner.remove();
    let overlay = document.getElementById('quickStateOverlay');
    if (overlay) overlay.remove();
}

function enterQuickStateMode() {
    window.quickStateMode = true;
    document.body.classList.add('quick-state-mode');
    setQuickStateSelection(null);
    applyQuickStateHandlers();
    setTimeout(showQuickStateBanner, 10);
}

function exitQuickStateMode(e) {
    window.quickStateMode = false;
    document.body.classList.remove('quick-state-mode');
    window.quickStateSelected = null;
    document.querySelectorAll('.image-box').forEach((box, idx) => {
        box.classList.remove('quick-select');
        box.classList.remove('quick-state-ready');
        const img = box.querySelector('.img-cropper-trigger');
        if (img) img.onclick = function(e) { showImageCropper(idx); e.stopPropagation(); };
    });
    document.body.onclick = null;
    hideQuickStateBanner();
}

function applyQuickStateHandlers() {
    document.querySelectorAll('.image-box').forEach((box, idx) => {
        box.classList.add('quick-select');
        box.classList.toggle('quick-state-ready', window.quickStateSelected !== null);
        box.onclick = async function(e) {
            if (!window.quickStateMode) return;
            if (e.target.closest('.remove-image-btn') || e.target.closest('.description') || e.target.closest('.status-select')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            if (window.quickStateSelected === null) {
                showToast('Elige primero un estado rápido.', 'info');
                return;
            }
            if (currentSessionName) {
                pushUndoState('Estado rápido');
            }
            await applyQuickStateToImage(idx, window.quickStateSelected);
            showToast(`Estado aplicado a Foto ${imagesData[idx]?.index || idx + 1}.`, 'success');
        };
        const img = box.querySelector('.img-cropper-trigger');
        if (img) {
            img.onclick = async function(e) {
                e.stopPropagation();
                if (!window.quickStateMode) {
                    showImageCropper(idx);
                    return;
                }
                if (window.quickStateSelected === null) {
                    showToast('Elige primero un estado rápido.', 'info');
                    return;
                }
                if (currentSessionName) {
                    pushUndoState('Estado rápido');
                }
                await applyQuickStateToImage(idx, window.quickStateSelected);
                showToast(`Estado aplicado a Foto ${imagesData[idx]?.index || idx + 1}.`, 'success');
            };
        }
    });
    document.body.onclick = null;
}

// --- Integración de menú ⋮ con backend ---
function setupSessionDropdownMenu() {
    var btn = document.getElementById('optionsMenuBtn');
    var dd = document.getElementById('optionsDropdown');
    if (!btn || !dd) return;
    // Asignar acciones correctas a los ítems del menú
    var borrarSesion = document.getElementById('menuDeleteSession');
    var borrarDB = document.getElementById('menuClearDB');
    if (borrarSesion) borrarSesion.onclick = function(e) {
        e.stopPropagation();
        deleteSessionFromDB();
        dd.style.opacity = '0';
        dd.style.visibility = 'hidden';
    };
    if (borrarDB) borrarDB.onclick = function(e) {
        e.stopPropagation();
        clearAllSessions();
        dd.style.opacity = '0';
        dd.style.visibility = 'hidden';
    };
    // Mostrar/ocultar menú
    btn.onclick = function(e) {
        e.stopPropagation();
        if(dd.style.opacity === '1') {
            dd.style.opacity = '0';
            dd.style.visibility = 'hidden';
        } else {
            dd.style.opacity = '1';
            dd.style.visibility = 'visible';
        }
    };
    document.addEventListener('click', function(e) {
        if(dd) { dd.style.opacity = '0'; dd.style.visibility = 'hidden'; }
    });
    dd.onclick = function(e) { e.stopPropagation(); };
}

// --- Fin de script ---
window.saveChangesToCurrentSession = async function() {
    const select = document.getElementById('sessionList');
    const selectedName = select && select.value ? select.value.trim() : '';
    const typedNameInput = document.getElementById('sessionNameInput');
    const typedName = typedNameInput && typedNameInput.value ? typedNameInput.value.trim() : '';
    const targetName = currentSessionName && selectedName && selectedName !== currentSessionName
        ? selectedName
        : (currentSessionName || selectedName);
    // Si hay imágenes nuevas y una sesión seleccionada, advertir antes de guardar
    if (targetName && imagesData.length > 0 && input && input.files && input.files.length > 0) {
        const confirmed = await showDecisionDialog({
            title: 'Guardar cambios en la sesión',
            message: 'Tienes imágenes nuevas cargadas. ¿Seguro que quieres guardarlas dentro de esta sesión?',
            confirmText: 'Guardar cambios',
            cancelText: 'Cancelar',
            tone: 'primary',
            icon: '↻'
        });
        if (!confirmed) {
            return;
        }
    }
    if (!targetName && typedName) {
        await saveSessionToDB();
        return;
    }

    if (!targetName) {
        await showDecisionDialog({
            title: 'No hay sesión seleccionada',
            message: 'Selecciona una sesión antes de guardar cambios.',
            confirmText: 'Entendido',
            tone: 'warning',
            showCancel: false,
            icon: '!'
        });
        return;
    }

    if (currentSessionName && targetName !== currentSessionName) {
        let targetImagesCount = 0;
        try {
            const targetRes = await apiFetch(`/session/${encodeURIComponent(targetName)}?includeImageData=false`);
            if (targetRes.ok) {
                const targetSession = await targetRes.json();
                targetImagesCount = Array.isArray(targetSession.images) ? targetSession.images.length : 0;
            }
        } catch (error) {
            console.warn('No se pudo verificar la sesión seleccionada antes de guardar:', error);
        }

        if (targetImagesCount > 0) {
            const confirmReplace = await showDecisionDialog({
                title: 'Guardar en la sesión seleccionada',
                message: `La sesión "${targetName}" ya tiene ${targetImagesCount} foto${targetImagesCount === 1 ? '' : 's'} o contenido guardado. ¿Deseas reemplazarla con lo que tienes abierto ahora?`,
                confirmText: 'Guardar y reemplazar',
                cancelText: 'Cancelar',
                tone: 'warning',
                icon: '↻'
            });
            if (!confirmReplace) {
                return;
            }
        }
    }

    try {
        await persistCurrentSessionChanges({ name: targetName, silent: false, source: 'manual' });
    } catch (e) {
        console.error('Error guardando cambios de sesión:', e);
        showToast(`Error al guardar los cambios en la sesión. ${e.message || ''}`, 'error');
    }
};

document.addEventListener('keydown', function(event) {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') {
        return;
    }

    const target = event.target;
    const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
    const isTypingTarget = tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable);
    if (isTypingTarget) {
        return;
    }

    event.preventDefault();
    undoLastAction();
});
