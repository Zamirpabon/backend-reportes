const input = document.getElementById('imageInput');
const cameraInput = document.getElementById('cameraInput');
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
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'image/heif'
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
const MAX_BACKGROUND_LOOSE_UPLOADS = 3;
const MOBILE_SORT_HOLD_DELAY_MS = 120;
const pendingLooseUploadQueue = [];
const canceledLooseUploadDraftIds = new Set();
const pendingImageDeletions = new Map();
let activeLooseUploadCount = 0;
let looseUploadDrainResolvers = [];
let looseUploadTotalCount = 0;
let looseUploadCompletedCount = 0;
let uploadLoaderDisplayCount = 0;
let uploadLoaderDisplayTimer = null;
let imageGridSortable = null;
let floatingScrollControls = null;
let __sessionBannerLastHtml = '';
let imageCounterLastTotal = -1;

// Agregar input para número inicial de imagen
let imageStartNumber = 1;
let nextImageUiId = 1;

function ensureImageUiId(imageData) {
    if (!imageData || typeof imageData !== 'object') {
        return `img-ui-${nextImageUiId++}`;
    }
    if (!imageData._uiId) {
        imageData._uiId = `img-ui-${nextImageUiId++}`;
    }
    return imageData._uiId;
}

input.addEventListener('change', handleImageUpload);
if (cameraInput) {
    cameraInput.addEventListener('click', () => {
        cameraInput.value = '';
    });
    cameraInput.addEventListener('change', async (event) => {
        const files = Array.from(event?.target?.files || []);
        if (files.length === 0) return;
        const latestPhoto = files[files.length - 1];
        try {
            await handleImageUpload({
                target: {
                    files: [latestPhoto],
                    value: ''
                }
            });
        } finally {
            cameraInput.value = '';
        }
    });
}

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

let smoothAnchorScrollFrame = null;

function easeInOutCubic(t) {
    if (t < 0.5) {
        return 4 * t * t * t;
    }
    return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getScrollAnimationDuration(distance) {
    const normalizedDistance = Math.abs(distance);
    return Math.max(550, Math.min(1250, 520 + (normalizedDistance * 0.18)));
}

function getScrollElement() {
    return getActiveScrollContainer();
}

function animateWindowScrollTo(targetTop) {
    const scrollEl = getActiveScrollContainer();
    const pageHeight = Math.max(
        scrollEl.scrollHeight || 0,
        document.documentElement.scrollHeight || 0,
        document.body.scrollHeight || 0
    );
    const viewportHeight = scrollEl.clientHeight || window.innerHeight || document.documentElement.clientHeight || 0;
    const clampedTarget = Math.max(0, Math.min(targetTop, Math.max(0, pageHeight - viewportHeight)));

    if (typeof scrollEl.scrollTo === 'function') {
        try {
            scrollEl.scrollTo({ top: clampedTarget, behavior: 'smooth' });
            if (scrollEl !== document.body && scrollEl !== document.documentElement && typeof window.scrollTo === 'function') {
                window.scrollTo({ top: clampedTarget, behavior: 'smooth' });
            }
            return;
        } catch (error) {
            // Fallback to custom animation if native smooth scroll fails
        }
    }

    const startTop = scrollEl.scrollTop || 0;
    const distance = clampedTarget - startTop;
    const animationDuration = getScrollAnimationDuration(distance);

    if (smoothAnchorScrollFrame) {
        cancelAnimationFrame(smoothAnchorScrollFrame);
        smoothAnchorScrollFrame = null;
    }

    if (Math.abs(distance) < 2) {
        scrollEl.scrollTo(0, clampedTarget);
        return;
    }

    const startedAt = performance.now();

    const step = (now) => {
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / animationDuration);
        const eased = easeInOutCubic(progress);
        const nextTop = startTop + (distance * eased);
        scrollEl.scrollTo(0, nextTop);

        if (progress < 1) {
            smoothAnchorScrollFrame = requestAnimationFrame(step);
        } else {
            scrollEl.scrollTo(0, clampedTarget);
            smoothAnchorScrollFrame = null;
        }
    };

    smoothAnchorScrollFrame = requestAnimationFrame(step);
}

function findScrollContainer() {
    const candidates = [
        document.querySelector('.container'),
        document.scrollingElement,
        document.documentElement,
        document.body,
        window
    ];
    for (const el of candidates) {
        if (!el) continue;
        const target = el === window ? document.documentElement : el;
        if (target.scrollHeight - target.clientHeight > 4) {
            return el;
        }
    }
    return window;
}

function smoothScrollTo(scrollEl, targetTop, duration = 600) {
    const isWindow = scrollEl === window;
    const startTop = isWindow
        ? (window.scrollY || document.documentElement.scrollTop || 0)
        : scrollEl.scrollTop;
    const distance = targetTop - startTop;
    if (Math.abs(distance) < 2) return;

    const startedAt = performance.now();
    const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    function step(now) {
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / duration);
        const eased = easeInOutCubic(progress);
        const nextTop = startTop + (distance * eased);
        if (isWindow) {
            window.scrollTo(0, nextTop);
        } else {
            scrollEl.scrollTop = nextTop;
        }
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function scrollToImageAnchor(position = 'top') {
    const grid = document.getElementById('gridContainer');
    if (!grid) return;

    const scrollEl = findScrollContainer();
    const isWindow = scrollEl === window;
    const viewportHeight = isWindow
        ? (window.innerHeight || document.documentElement.clientHeight)
        : scrollEl.clientHeight;
    const currentScrollTop = isWindow
        ? (window.scrollY || document.documentElement.scrollTop || 0)
        : scrollEl.scrollTop;
    const scrollHeight = isWindow
        ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
        : scrollEl.scrollHeight;

    const gridRect = grid.getBoundingClientRect();
    const scrollElRect = isWindow ? { top: 0 } : scrollEl.getBoundingClientRect();
    const gridTopRelativeToScroller = gridRect.top - scrollElRect.top + currentScrollTop;
    const gridHeight = grid.scrollHeight || gridRect.height;

    let targetTop = 0;
    if (position === 'top') {
        targetTop = Math.max(0, gridTopRelativeToScroller - 16);
    } else if (position === 'middle') {
        const gridCenter = gridTopRelativeToScroller + (gridHeight / 2);
        targetTop = gridCenter - (viewportHeight / 2);
    } else if (position === 'bottom') {
        targetTop = gridTopRelativeToScroller + gridHeight - viewportHeight + 16;
    }

    const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
    targetTop = Math.max(0, Math.min(targetTop, maxScrollTop));

    smoothScrollTo(scrollEl, targetTop, 600);
}

function updateScrollControlState() {
    if (!floatingScrollControls) return;
    const container = document.querySelector('.container');
    if (!container) return;

    const pageHeight = container.scrollHeight;
    const viewportHeight = container.clientHeight;
    const maxScrollTop = Math.max(0, pageHeight - viewportHeight);
    const hasScroll = maxScrollTop > 4;
    floatingScrollControls.classList.toggle('is-empty', !hasScroll);
    floatingScrollControls.querySelectorAll('button').forEach((button) => {
        button.disabled = false;
        button.classList.toggle('is-disabled', !hasScroll);
    });
}

function ensureFloatingScrollControls() {
    if (floatingScrollControls || !document.body) return;

    const controls = document.createElement('div');
    controls.className = 'floating-scroll-controls';
    controls.setAttribute('aria-label', 'Navegación rápida de fotos');
    controls.innerHTML = `
        <button type="button" class="floating-scroll-btn" data-scroll-target="top" title="Ir a la primera foto" aria-label="Ir a la primera foto">
            ↑
        </button>
        <button type="button" class="floating-scroll-btn floating-scroll-btn-middle" data-scroll-target="middle" title="Ir a la mitad de las fotos" aria-label="Ir a la mitad de las fotos">
            •
        </button>
        <button type="button" class="floating-scroll-btn" data-scroll-target="bottom" title="Ir a la última foto" aria-label="Ir a la última foto">
            ↓
        </button>
    `;

    controls.querySelectorAll('button[data-scroll-target]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.disabled) return;
            scrollToImageAnchor(button.getAttribute('data-scroll-target'));
        });
    });

    document.body.appendChild(controls);
    floatingScrollControls = controls;
    updateScrollControlState();
    setTimeout(updateScrollControlState, 100);

    window.addEventListener('resize', updateScrollControlState);
    window.addEventListener('scroll', updateScrollControlState);
    window.addEventListener('load', updateScrollControlState);
}

window.scrollToImageAnchor = scrollToImageAnchor;
window.animateWindowScrollTo = animateWindowScrollTo;
window.updateScrollBtns = updateScrollControlState;

function refreshFullscreenOverlayFlag() {
    if (!document || !document.body) return;
    const anyVisible = (appLoaderOverlay && appLoaderOverlay.classList.contains('is-visible'))
        || (exportLoaderOverlay && exportLoaderOverlay.classList.contains('is-visible'));
    document.body.classList.toggle('has-fullscreen-overlay', !!anyVisible);
}

function showAppLoader(message = 'Cargando sesión...') {
    if (!appLoaderOverlay) return;
    if (appLoaderLabel) {
        appLoaderLabel.textContent = message;
    }
    appLoaderShownAt = Date.now();
    appLoaderOverlay.classList.add('is-visible');
    appLoaderOverlay.setAttribute('aria-hidden', 'false');
    refreshFullscreenOverlayFlag();
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
    refreshFullscreenOverlayFlag();
}

function showExportLoader(title = 'Generando reporte Word', text = 'Estamos preparando tu documento...') {
    if (!exportLoaderOverlay) return;
    if (exportLoaderTitle) exportLoaderTitle.textContent = title;
    if (exportLoaderText) exportLoaderText.textContent = text;
    exportLoaderOverlay.classList.add('is-visible');
    exportLoaderOverlay.setAttribute('aria-hidden', 'false');
    refreshFullscreenOverlayFlag();
}

function hideExportLoader() {
    if (!exportLoaderOverlay) return;
    exportLoaderOverlay.classList.remove('is-visible');
    exportLoaderOverlay.setAttribute('aria-hidden', 'true');
    refreshFullscreenOverlayFlag();
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
        looseUploadTotalCount = Number(total || 0);
        if (Number(current || 0) === 0) {
            uploadLoaderDisplayCount = 0;
        }
        uploadLoaderCount.textContent = `${uploadLoaderDisplayCount}/${looseUploadTotalCount}`;
        animateUploadLoaderCount(current, looseUploadTotalCount);
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

    const sessionBytesByName = new Map(
        (latestStorageUsage?.sessionsBreakdown || []).map((entry) => [entry.name, Number(entry.usedBytes || 0)])
    );
    const looseBytes = Number(latestStorageUsage?.looseBytes || 0);
    const totalBytes = Number(latestStorageUsage?.usedBytes || 0);
    const orphanBytesFromApi = Number(latestStorageUsage?.orphanBytes || 0);
    const orphanCount = Number(latestStorageUsage?.orphanFilesCount || 0);
    const orphanFiles = Array.isArray(latestStorageUsage?.orphanFiles)
        ? latestStorageUsage.orphanFiles
        : [];

    let accountedBytes = looseBytes;
    for (const entry of (latestStorageUsage?.sessionsBreakdown || [])) {
        accountedBytes += Number(entry.usedBytes || 0);
    }
    const orphanBytes = orphanBytesFromApi > 0
        ? orphanBytesFromApi
        : Math.max(0, totalBytes - accountedBytes);

    const renderedRows = rows.map((session) => {
        const bytes = session.name === 'Sin sesión'
            ? looseBytes
            : (sessionBytesByName.get(session.name) || 0);
        const sizeStr = bytes > 0 ? ` · ${formatBytes(bytes)}` : '';
        return `
            <div class="storage-session-item">
                <span class="storage-session-name">${session.name}</span>
                <span class="storage-session-count">${session.photoCount} foto${session.photoCount === 1 ? '' : 's'}${sizeStr}</span>
            </div>
        `;
    });

    if (orphanBytes > 1024) {
        const summaryCount = orphanCount > 0
            ? `${orphanCount} archivo${orphanCount === 1 ? '' : 's'} · ${formatBytes(orphanBytes)}`
            : `${formatBytes(orphanBytes)}`;

        renderedRows.push(`
            <div class="storage-session-item storage-session-item-orphan" data-orphan-toggle="true" role="button" tabindex="0" aria-expanded="false" title="Archivos en Storage que ya no están referenciados por ninguna sesión. Sobrantes de fotos eliminadas o reemplazadas.">
                <span class="storage-session-name">
                    Archivos sin uso
                    <span class="storage-orphan-caret" aria-hidden="true">▾</span>
                </span>
                <span class="storage-session-count">${summaryCount}</span>
            </div>
            <div class="storage-orphan-list" hidden>
                <button type="button" class="storage-orphan-gallery-btn" id="storageOrphanGalleryBtn">
                    Ver galería de archivos sin uso
                </button>
            </div>
        `);
    }

    storageSessionsDropdown.innerHTML = `
        <div class="storage-sessions-list">
            ${renderedRows.join('')}
        </div>
    `;

    const orphanToggle = storageSessionsDropdown.querySelector('[data-orphan-toggle]');
    const orphanList = storageSessionsDropdown.querySelector('.storage-orphan-list');
    if (orphanToggle && orphanList) {
        const toggleOrphans = (event) => {
            event.stopPropagation();
            const isOpen = !orphanList.hidden;
            orphanList.hidden = isOpen;
            orphanToggle.setAttribute('aria-expanded', String(!isOpen));
            orphanToggle.classList.toggle('is-expanded', !isOpen);
        };
        orphanToggle.addEventListener('click', toggleOrphans);
        orphanToggle.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleOrphans(event);
            }
        });
    }

    const galleryBtn = storageSessionsDropdown.querySelector('#storageOrphanGalleryBtn');
    if (galleryBtn) {
        galleryBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            openOrphanGallery(orphanFiles, orphanCount, orphanBytes);
        });
    }
}

const ORPHAN_GALLERY_PAGE_SIZE = 50;
let orphanGalleryState = {
    files: [],
    page: 0,
    totalCount: 0,
    totalBytes: 0,
    selected: new Set()
};

function formatOrphanDate(isoString) {
    if (!isoString) return { relative: '', absolute: '' };
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return { relative: '', absolute: '' };

    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);

    let relative;
    if (diffMin < 1) relative = 'hace instantes';
    else if (diffMin < 60) relative = `hace ${diffMin} min`;
    else if (diffH < 24) relative = `hace ${diffH} h`;
    else if (diffD < 7) relative = `hace ${diffD} día${diffD === 1 ? '' : 's'}`;
    else if (diffD < 30) relative = `hace ${Math.floor(diffD / 7)} sem`;
    else if (diffD < 365) relative = `hace ${Math.floor(diffD / 30)} mes${Math.floor(diffD / 30) === 1 ? '' : 'es'}`;
    else relative = `hace ${Math.floor(diffD / 365)} año${Math.floor(diffD / 365) === 1 ? '' : 's'}`;

    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dd = String(date.getDate()).padStart(2, '0');
    const mmm = months[date.getMonth()];
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const absolute = `${dd} ${mmm} ${yyyy} · ${hh}:${mi}`;

    return { relative, absolute };
}

function buildPencilLoaderSVG(uniqueId) {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" height="60" width="60" viewBox="0 0 200 200" class="image-pencil-loader">
            <defs>
                <clipPath id="pencil-eraser-${uniqueId}">
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
                        <rect clip-path="url(#pencil-eraser-${uniqueId})" height="30" width="5" fill="hsl(223,90%,60%)"></rect>
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
    `;
}

async function openOrphanGallery(files, totalCount, totalBytes) {
    if (!Array.isArray(files) || files.length === 0) return;
    const bridge = window.directSupabaseBridge;
    if (!bridge?.getStorageFileUrl) return;

    orphanGalleryState = {
        files: files.slice(),
        page: 0,
        totalCount: Number(totalCount || files.length),
        totalBytes: Number(totalBytes || 0),
        selected: new Set()
    };

    let modal = document.getElementById('orphanGalleryModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'orphanGalleryModal';
        modal.className = 'orphan-gallery-modal';
        modal.innerHTML = `
            <div class="orphan-gallery-backdrop" data-close="true"></div>
            <div class="orphan-gallery-panel" role="dialog" aria-modal="true">
                <div class="orphan-gallery-header">
                    <div>
                        <h3 class="orphan-gallery-title">Archivos sin uso</h3>
                        <p class="orphan-gallery-subtitle" id="orphanGallerySubtitle"></p>
                    </div>
                    <button type="button" class="orphan-gallery-close" data-close="true" aria-label="Cerrar">×</button>
                </div>
                <div class="orphan-gallery-toolbar">
                    <div class="orphan-toolbar-group orphan-toolbar-selection">
                        <button type="button" class="orphan-pill orphan-pill-ghost" id="orphanSelectPage" title="Marcar/desmarcar todas las cards visibles">
                            <span class="orphan-pill-icon">▦</span>
                            <span class="orphan-pill-label">Página</span>
                        </button>
                        <button type="button" class="orphan-pill orphan-pill-ghost" id="orphanSelectAll" title="Marcar/desmarcar todos los archivos del modal">
                            <span class="orphan-pill-icon">✓</span>
                            <span class="orphan-pill-label">Todos</span>
                        </button>
                        <button type="button" class="orphan-pill orphan-pill-ghost" id="orphanClearSelection" title="Quitar selección">
                            <span class="orphan-pill-icon">✕</span>
                            <span class="orphan-pill-label">Limpiar</span>
                        </button>
                    </div>
                    <div class="orphan-toolbar-counter" id="orphanSelectionCount">
                        <span class="orphan-counter-number">0</span>
                        <span class="orphan-counter-label">seleccionados</span>
                    </div>
                    <div class="orphan-toolbar-group orphan-toolbar-actions">
                        <button type="button" class="orphan-pill orphan-pill-recover" id="orphanRecoverSelected" disabled title="Recuperar archivos seleccionados a una sesión">
                            <span class="orphan-pill-icon">↺</span>
                            <span class="orphan-pill-label">Recuperar</span>
                        </button>
                        <button type="button" class="orphan-pill orphan-pill-danger" id="orphanDeleteSelected" disabled title="Eliminar los archivos seleccionados">
                            <span class="orphan-pill-icon">🗑</span>
                            <span class="orphan-pill-label">Eliminar</span>
                        </button>
                        <button type="button" class="orphan-pill orphan-pill-danger-strong" id="orphanDeleteAll" title="Eliminar TODOS los archivos sin uso del modal">
                            <span class="orphan-pill-icon">⚠</span>
                            <span class="orphan-pill-label">Eliminar todos</span>
                        </button>
                    </div>
                </div>
                <div class="orphan-gallery-grid" id="orphanGalleryGrid"></div>
                <div class="orphan-gallery-pagination" id="orphanGalleryPagination"></div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (event) => {
            if (event.target.closest('[data-close="true"]')) modal.classList.remove('is-open');
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                const lightbox = document.getElementById('orphanLightbox');
                if (lightbox && lightbox.classList.contains('is-open')) {
                    lightbox.classList.remove('is-open');
                    return;
                }
                modal.classList.remove('is-open');
            }
        });

        modal.querySelector('#orphanSelectPage').addEventListener('click', () => toggleSelectCurrentPage());
        modal.querySelector('#orphanSelectAll').addEventListener('click', () => toggleSelectAll());
        modal.querySelector('#orphanClearSelection').addEventListener('click', () => {
            orphanGalleryState.selected.clear();
            renderOrphanGalleryPage();
        });
        modal.querySelector('#orphanDeleteSelected').addEventListener('click', () => bulkOrphanDelete());
        modal.querySelector('#orphanDeleteAll').addEventListener('click', () => deleteAllOrphans());
        modal.querySelector('#orphanRecoverSelected').addEventListener('click', () => bulkOrphanRecover());
    }

    modal.classList.add('is-open');
    await renderOrphanGalleryPage();
}

function toggleSelectCurrentPage() {
    const { files, page, selected } = orphanGalleryState;
    const start = page * ORPHAN_GALLERY_PAGE_SIZE;
    const end = Math.min(start + ORPHAN_GALLERY_PAGE_SIZE, files.length);
    const pagePaths = files.slice(start, end).map((f) => f.storagePath);
    const allSelected = pagePaths.every((p) => selected.has(p));
    if (allSelected) pagePaths.forEach((p) => selected.delete(p));
    else pagePaths.forEach((p) => selected.add(p));
    renderOrphanGalleryPage();
}

function toggleSelectAll() {
    // Por seguridad, "Seleccionar todos" actúa solo sobre la página visible
    // (igual que "Seleccionar página") para no marcar archivos no visibles.
    toggleSelectCurrentPage();
}

async function renderOrphanGalleryPage() {
    const modal = document.getElementById('orphanGalleryModal');
    if (!modal) return;
    const bridge = window.directSupabaseBridge;
    if (!bridge?.getStorageFileUrl) return;

    const { files, page, totalCount, totalBytes, selected } = orphanGalleryState;
    const totalPages = Math.max(1, Math.ceil(files.length / ORPHAN_GALLERY_PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    orphanGalleryState.page = safePage;

    const start = safePage * ORPHAN_GALLERY_PAGE_SIZE;
    const end = Math.min(start + ORPHAN_GALLERY_PAGE_SIZE, files.length);
    const pageFiles = files.slice(start, end);

    const subtitle = modal.querySelector('#orphanGallerySubtitle');
    const grid = modal.querySelector('#orphanGalleryGrid');
    const pagination = modal.querySelector('#orphanGalleryPagination');
    const selectionCount = modal.querySelector('#orphanSelectionCount');
    const deleteSelectedBtn = modal.querySelector('#orphanDeleteSelected');
    const recoverSelectedBtn = modal.querySelector('#orphanRecoverSelected');

    if (subtitle) {
        const extra = Math.max(0, totalCount - files.length);
        subtitle.textContent = files.length > 0
            ? `Mostrando ${start + 1}–${end} de ${files.length}${extra > 0 ? ` (${extra} no listados)` : ''} · ${formatBytes(totalBytes)}`
            : 'No quedan archivos sin uso.';
    }

    updateSelectionUI();
    if (deleteSelectedBtn) deleteSelectedBtn.disabled = selected.size === 0;
    if (recoverSelectedBtn) recoverSelectedBtn.disabled = selected.size === 0;

    if (grid) {
        if (pageFiles.length === 0) {
            grid.innerHTML = `<div class="orphan-gallery-empty">No quedan archivos sin uso.</div>`;
        } else {
            grid.innerHTML = pageFiles.map((file, idx) => {
                const path = String(file?.storagePath || '');
                const fileName = path.split('/').pop() || path;
                const folder = path.includes('/') ? path.split('/').slice(0, -1).join('/') : '';
                const size = Number(file?.sizeBytes || 0);
                const isSelected = selected.has(path);
                const created = formatOrphanDate(file?.createdAt);
                const updated = formatOrphanDate(file?.updatedAt);
                const timeBadge = created.relative
                    ? `<span class="orphan-gallery-time-badge" title="Subido: ${created.absolute}${updated.absolute && updated.absolute !== created.absolute ? `\nÚltima modificación: ${updated.absolute}` : ''}">⏱ ${created.relative}</span>`
                    : '';
                return `
                    <figure class="orphan-gallery-card ${isSelected ? 'is-selected' : ''}" data-orphan-path="${path}">
                        <label class="orphan-card-checkbox" title="Seleccionar">
                            <input type="checkbox" data-orphan-select="${path}" ${isSelected ? 'checked' : ''}>
                            <span class="orphan-card-checkmark"></span>
                        </label>
                        <span class="orphan-gallery-size-badge">${formatBytes(size)}</span>
                        ${folder ? `<span class="orphan-gallery-folder-badge">${folder}</span>` : ''}
                        ${timeBadge}
                        <div class="orphan-gallery-img-wrap">
                            <div class="orphan-gallery-loading">${buildPencilLoaderSVG(`orphan-${start + idx}`)}</div>
                        </div>
                        <div class="orphan-card-actions">
                            <button type="button" class="orphan-card-action orphan-action-expand" data-orphan-expand="${path}" title="Ver pantalla completa">⛶</button>
                            <button type="button" class="orphan-card-action orphan-action-recover" data-orphan-recover="${path}" title="Recuperar a una sesión">↺</button>
                            <button type="button" class="orphan-card-action orphan-action-delete" data-orphan-delete="${path}" title="Eliminar archivo">🗑️</button>
                        </div>
                        <figcaption class="orphan-gallery-caption" title="${path}${created.absolute ? `\nSubido: ${created.absolute}` : ''}">
                            <span class="orphan-caption-name">${fileName}</span>
                            ${created.absolute ? `<span class="orphan-caption-date">${created.absolute}</span>` : ''}
                        </figcaption>
                    </figure>
                `;
            }).join('');
        }
    }

    if (pagination) {
        pagination.innerHTML = renderOrphanPaginationControls(safePage, totalPages);
        pagination.querySelectorAll('[data-page]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = Number(btn.getAttribute('data-page'));
                if (Number.isFinite(target)) {
                    orphanGalleryState.page = target;
                    renderOrphanGalleryPage();
                }
            });
        });
    }

    const cards = modal.querySelectorAll('.orphan-gallery-card');
    cards.forEach(async (card) => {
        const path = card.getAttribute('data-orphan-path');
        if (!path) return;
        try {
            const url = await bridge.getStorageFileUrl(path);
            const wrap = card.querySelector('.orphan-gallery-img-wrap');
            if (wrap && url) {
                const img = document.createElement('img');
                img.src = url;
                img.alt = path;
                img.loading = 'lazy';
                img.addEventListener('load', () => {
                    const loading = wrap.querySelector('.orphan-gallery-loading');
                    if (loading) loading.remove();
                });
                img.addEventListener('error', () => {
                    const loading = wrap.querySelector('.orphan-gallery-loading');
                    if (loading) loading.innerHTML = '<span class="orphan-gallery-error">Sin vista previa</span>';
                });
                img.dataset.fullUrl = url;
                wrap.appendChild(img);
            }
        } catch (_) {
            const wrap = card.querySelector('.orphan-gallery-img-wrap');
            const loading = wrap?.querySelector('.orphan-gallery-loading');
            if (loading) loading.innerHTML = '<span class="orphan-gallery-error">No se pudo cargar</span>';
        }
    });

    modal.querySelectorAll('[data-orphan-select]').forEach((checkbox) => {
        checkbox.addEventListener('change', (event) => {
            event.stopPropagation();
            const path = checkbox.getAttribute('data-orphan-select');
            if (checkbox.checked) orphanGalleryState.selected.add(path);
            else orphanGalleryState.selected.delete(path);
            const card = checkbox.closest('.orphan-gallery-card');
            if (card) card.classList.toggle('is-selected', checkbox.checked);
            updateSelectionUI();
        });
    });

    modal.querySelectorAll('[data-orphan-expand]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const path = btn.getAttribute('data-orphan-expand');
            openOrphanLightbox(path);
        });
    });
    modal.querySelectorAll('[data-orphan-delete]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const path = btn.getAttribute('data-orphan-delete');
            handleOrphanDelete(path, btn);
        });
    });
    modal.querySelectorAll('[data-orphan-recover]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const path = btn.getAttribute('data-orphan-recover');
            openOrphanRecoverDialog([path]);
        });
    });
}

function updateSelectionUI() {
    const modal = document.getElementById('orphanGalleryModal');
    if (!modal) return;
    const { files, selected } = orphanGalleryState;
    const selectionCount = modal.querySelector('#orphanSelectionCount');
    const deleteSelectedBtn = modal.querySelector('#orphanDeleteSelected');
    const recoverSelectedBtn = modal.querySelector('#orphanRecoverSelected');
    const selectedSize = files.reduce((sum, f) => selected.has(f.storagePath) ? sum + Number(f.sizeBytes || 0) : sum, 0);

    if (selectionCount) {
        const numberEl = selectionCount.querySelector('.orphan-counter-number');
        const labelEl = selectionCount.querySelector('.orphan-counter-label');
        if (numberEl) numberEl.textContent = String(selected.size);
        if (labelEl) {
            labelEl.textContent = selected.size === 0
                ? 'sin selección'
                : selected.size === 1
                    ? `archivo · ${formatBytes(selectedSize)}`
                    : `archivos · ${formatBytes(selectedSize)}`;
        }
        selectionCount.classList.toggle('is-active', selected.size > 0);
    }
    if (deleteSelectedBtn) deleteSelectedBtn.disabled = selected.size === 0;
    if (recoverSelectedBtn) recoverSelectedBtn.disabled = selected.size === 0;
}

async function openOrphanLightbox(storagePath) {
    const bridge = window.directSupabaseBridge;
    if (!bridge?.getStorageFileUrl) return;
    let lightbox = document.getElementById('orphanLightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'orphanLightbox';
        lightbox.className = 'orphan-lightbox';
        lightbox.innerHTML = `
            <button type="button" class="orphan-lightbox-close" aria-label="Cerrar">×</button>
            <div class="orphan-lightbox-loading">${buildPencilLoaderSVG('lightbox')}</div>
            <img class="orphan-lightbox-img" alt="">
        `;
        document.body.appendChild(lightbox);
        lightbox.addEventListener('click', (event) => {
            if (event.target === lightbox || event.target.classList.contains('orphan-lightbox-close')) {
                lightbox.classList.remove('is-open');
            }
        });
    }
    const img = lightbox.querySelector('.orphan-lightbox-img');
    const loading = lightbox.querySelector('.orphan-lightbox-loading');
    img.style.display = 'none';
    loading.style.display = 'flex';
    lightbox.classList.add('is-open');
    try {
        const url = await bridge.getStorageFileUrl(storagePath);
        img.onload = () => {
            loading.style.display = 'none';
            img.style.display = 'block';
        };
        img.src = url;
        img.alt = storagePath;
    } catch (_) {
        loading.innerHTML = '<span class="orphan-gallery-error">No se pudo cargar</span>';
    }
}

function renderOrphanPaginationControls(currentPage, totalPages) {
    if (totalPages <= 1) return '';
    const buttons = [];
    buttons.push(`<button type="button" data-page="${Math.max(0, currentPage - 1)}" ${currentPage === 0 ? 'disabled' : ''} class="orphan-pag-btn">‹ Anterior</button>`);

    const windowSize = 5;
    let from = Math.max(0, currentPage - Math.floor(windowSize / 2));
    let to = Math.min(totalPages, from + windowSize);
    from = Math.max(0, to - windowSize);

    if (from > 0) {
        buttons.push(`<button type="button" data-page="0" class="orphan-pag-num">1</button>`);
        if (from > 1) buttons.push(`<span class="orphan-pag-dots">…</span>`);
    }
    for (let i = from; i < to; i++) {
        buttons.push(`<button type="button" data-page="${i}" class="orphan-pag-num ${i === currentPage ? 'is-active' : ''}">${i + 1}</button>`);
    }
    if (to < totalPages) {
        if (to < totalPages - 1) buttons.push(`<span class="orphan-pag-dots">…</span>`);
        buttons.push(`<button type="button" data-page="${totalPages - 1}" class="orphan-pag-num">${totalPages}</button>`);
    }

    buttons.push(`<button type="button" data-page="${Math.min(totalPages - 1, currentPage + 1)}" ${currentPage >= totalPages - 1 ? 'disabled' : ''} class="orphan-pag-btn">Siguiente ›</button>`);
    return buttons.join('');
}

function showConfirmDialog({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, requireType = null, icon = null } = {}) {
    return new Promise((resolve) => {
        let dialog = document.getElementById('appConfirmDialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'appConfirmDialog';
            dialog.className = 'app-confirm-dialog';
            dialog.innerHTML = `
                <div class="app-confirm-backdrop" data-confirm-action="cancel"></div>
                <div class="app-confirm-panel" role="dialog" aria-modal="true">
                    <div class="app-confirm-icon" id="appConfirmIcon"></div>
                    <h3 class="app-confirm-title" id="appConfirmTitle"></h3>
                    <p class="app-confirm-message" id="appConfirmMessage"></p>
                    <div class="app-confirm-typebox" id="appConfirmTypeBox" hidden>
                        <label class="app-confirm-typelabel" id="appConfirmTypeLabel"></label>
                        <input type="text" class="app-confirm-typeinput" id="appConfirmTypeInput" autocomplete="off">
                    </div>
                    <div class="app-confirm-actions">
                        <button type="button" class="app-confirm-btn app-confirm-cancel" data-confirm-action="cancel" id="appConfirmCancelBtn"></button>
                        <button type="button" class="app-confirm-btn app-confirm-ok" data-confirm-action="ok" id="appConfirmOkBtn"></button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);
        }

        const titleEl = dialog.querySelector('#appConfirmTitle');
        const msgEl = dialog.querySelector('#appConfirmMessage');
        const iconEl = dialog.querySelector('#appConfirmIcon');
        const okBtn = dialog.querySelector('#appConfirmOkBtn');
        const cancelBtn = dialog.querySelector('#appConfirmCancelBtn');
        const typeBox = dialog.querySelector('#appConfirmTypeBox');
        const typeLabel = dialog.querySelector('#appConfirmTypeLabel');
        const typeInput = dialog.querySelector('#appConfirmTypeInput');

        titleEl.textContent = title || '¿Continuar?';
        msgEl.innerHTML = message || '';
        iconEl.textContent = icon || (danger ? '⚠️' : '❓');
        iconEl.className = `app-confirm-icon ${danger ? 'is-danger' : ''}`;
        okBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        okBtn.className = `app-confirm-btn app-confirm-ok ${danger ? 'is-danger' : ''}`;

        if (requireType) {
            typeBox.hidden = false;
            typeLabel.textContent = `Escribe "${requireType}" para confirmar:`;
            typeInput.value = '';
            okBtn.disabled = true;
            const checkType = () => {
                okBtn.disabled = typeInput.value.trim() !== requireType;
            };
            typeInput.oninput = checkType;
        } else {
            typeBox.hidden = true;
            typeInput.value = '';
            okBtn.disabled = false;
        }

        dialog.classList.add('is-open');
        setTimeout(() => {
            if (requireType) typeInput.focus();
            else okBtn.focus();
        }, 80);

        const cleanup = (result) => {
            dialog.classList.remove('is-open');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            document.removeEventListener('keydown', escHandler);
            resolve(result);
        };
        const escHandler = (event) => {
            if (event.key === 'Escape') cleanup(false);
        };
        document.addEventListener('keydown', escHandler);

        okBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);
        dialog.querySelector('.app-confirm-backdrop').onclick = () => cleanup(false);
    });
}

function animateOrphanCardsRemoval(paths) {
    return new Promise((resolve) => {
        const cards = paths.map((path) =>
            document.querySelector(`.orphan-gallery-card[data-orphan-path="${CSS.escape(path)}"]`)
        ).filter(Boolean);
        if (cards.length === 0) return resolve();
        cards.forEach((card, idx) => {
            setTimeout(() => card.classList.add('is-removing'), Math.min(idx * 22, 280));
        });
        setTimeout(resolve, Math.min(cards.length * 22, 280) + 420);
    });
}

function optimisticallyRemoveFromState(paths) {
    const pathsSet = new Set(paths);
    const removedBytes = orphanGalleryState.files.reduce(
        (sum, f) => pathsSet.has(f.storagePath) ? sum + Number(f.sizeBytes || 0) : sum,
        0
    );
    orphanGalleryState.files = orphanGalleryState.files.filter((f) => !pathsSet.has(f.storagePath));
    orphanGalleryState.totalCount = Math.max(0, orphanGalleryState.totalCount - paths.length);
    orphanGalleryState.totalBytes = Math.max(0, orphanGalleryState.totalBytes - removedBytes);
    paths.forEach((p) => orphanGalleryState.selected.delete(p));
    return removedBytes;
}

async function bulkOrphanDelete() {
    const paths = Array.from(orphanGalleryState.selected);
    if (paths.length === 0) return;
    const totalSize = orphanGalleryState.files.reduce(
        (sum, f) => paths.includes(f.storagePath) ? sum + Number(f.sizeBytes || 0) : sum,
        0
    );

    const confirmed = await showConfirmDialog({
        title: `¿Eliminar ${paths.length} archivo${paths.length === 1 ? '' : 's'}?`,
        message: `Se liberarán <strong>~${formatBytes(totalSize)}</strong> de Storage.<br>Esta acción <strong>no se puede deshacer</strong>.`,
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        danger: true,
        icon: '🗑️'
    });
    if (!confirmed) return;

    // 1. Animación inmediata
    animateOrphanCardsRemoval(paths);

    // 2. Sacar del state inmediatamente (optimista)
    optimisticallyRemoveFromState(paths);

    // 3. Re-render después de la animación con la lista ya filtrada
    setTimeout(() => {
        const totalPages = Math.max(1, Math.ceil(orphanGalleryState.files.length / ORPHAN_GALLERY_PAGE_SIZE));
        orphanGalleryState.page = Math.min(orphanGalleryState.page, totalPages - 1);
        renderOrphanGalleryPage();
    }, 360);

    showToast(`${paths.length} archivo${paths.length === 1 ? '' : 's'} eliminado${paths.length === 1 ? '' : 's'} · ${formatBytes(totalSize)} liberado${totalSize === 0 ? '' : 's'}`, 'success');

    // 4. API en background (silencioso si falla solo reportar)
    try {
        const res = await apiFetch('/orphans/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storagePaths: paths })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || 'Error');
        // Refrescar tarjeta de uso de espacio (sin re-renderizar la galería)
        fetchStorageUsage();
    } catch (error) {
        showToast(`Error de fondo al borrar: ${error.message}. Recargando...`, 'error');
        await refreshOrphanGalleryData();
    }
}

async function deleteAllOrphans() {
    const all = orphanGalleryState.files.map((f) => f.storagePath);
    if (all.length === 0) return;
    const totalBytes = orphanGalleryState.totalBytes;

    const confirmed = await showConfirmDialog({
        title: `⚠️ Eliminar TODOS los archivos`,
        message: `Esto elimina <strong>los ${all.length} archivos</strong> sin uso en <strong>TODAS las páginas</strong>.<br>Se liberarán <strong>~${formatBytes(totalBytes)}</strong>.<br><br>Esta acción <strong>NO se puede deshacer</strong>. Escribe la palabra exacta para confirmar.`,
        confirmText: `Eliminar los ${all.length}`,
        cancelText: 'Cancelar',
        danger: true,
        icon: '⚠️',
        requireType: 'ELIMINAR'
    });
    if (!confirmed) {
        showToast('Cancelado.', 'info');
        return;
    }

    // 1. Animar las cards visibles (no podemos animar las de otras páginas)
    const { page } = orphanGalleryState;
    const start = page * ORPHAN_GALLERY_PAGE_SIZE;
    const end = Math.min(start + ORPHAN_GALLERY_PAGE_SIZE, orphanGalleryState.files.length);
    const visiblePaths = orphanGalleryState.files.slice(start, end).map((f) => f.storagePath);
    animateOrphanCardsRemoval(visiblePaths);

    // 2. Limpiar TODO el state (optimista)
    orphanGalleryState.files = [];
    orphanGalleryState.totalCount = 0;
    orphanGalleryState.totalBytes = 0;
    orphanGalleryState.selected.clear();
    orphanGalleryState.page = 0;

    // 3. Re-render después de la animación → vacío
    setTimeout(() => renderOrphanGalleryPage(), 380);

    showToast(`Eliminando ${all.length} archivos en lotes...`, 'info');

    // 4. API en background con lotes
    try {
        const batchSize = 200;
        let totalDeleted = 0;
        for (let i = 0; i < all.length; i += batchSize) {
            const batch = all.slice(i, i + batchSize);
            const res = await apiFetch('/orphans/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storagePaths: batch })
            });
            const result = await res.json();
            if (res.ok && Number.isFinite(result?.deleted)) {
                totalDeleted += result.deleted;
            }
        }
        showToast(`✓ ${totalDeleted} archivos eliminados · ${formatBytes(totalBytes)} liberados`, 'success');
        fetchStorageUsage();
    } catch (error) {
        showToast(`Error al eliminar masivo: ${error.message}`, 'error');
        await refreshOrphanGalleryData();
    }
}

async function bulkOrphanRecover() {
    const paths = Array.from(orphanGalleryState.selected);
    if (paths.length === 0) return;
    openOrphanRecoverDialog(paths);
}

async function openOrphanRecoverDialog(storagePaths) {
    if (!Array.isArray(storagePaths) || storagePaths.length === 0) return;

    // Asegurar lista de sesiones cargada
    if (!Array.isArray(sessionSummaries) || sessionSummaries.length === 0) {
        try {
            if (typeof loadSessionList === 'function') await loadSessionList(currentSessionName || '');
        } catch (_) {}
    }

    const isSingle = storagePaths.length === 1;
    const totalSize = orphanGalleryState.files.reduce(
        (sum, f) => storagePaths.includes(f.storagePath) ? sum + Number(f.sizeBytes || 0) : sum,
        0
    );

    let dialog = document.getElementById('orphanRecoverDialog');
    if (dialog) dialog.remove();
    dialog = document.createElement('div');
    dialog.id = 'orphanRecoverDialog';
    dialog.className = 'orphan-recover-dialog';

    const sessions = Array.isArray(sessionSummaries) ? sessionSummaries.slice() : [];
    sessions.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    const sessionsListHTML = sessions.length > 0
        ? sessions.map((s) => `
            <button type="button" class="recover-session-item ${s.name === currentSessionName ? 'is-active' : ''}" data-session-name="${s.name.replace(/"/g, '&quot;')}">
                <span class="recover-session-name">${s.name}</span>
                <span class="recover-session-photos">${s.photoCount || 0} foto${(s.photoCount === 1) ? '' : 's'}${s.name === currentSessionName ? ' · activa' : ''}</span>
            </button>
        `).join('')
        : '<div class="recover-empty-sessions">No tienes sesiones guardadas todavía.</div>';

    dialog.innerHTML = `
        <div class="orphan-recover-backdrop" data-close="true"></div>
        <div class="orphan-recover-panel orphan-recover-panel-wide" role="dialog" aria-modal="true">
            <div class="recover-header">
                <div class="recover-header-icon">↺</div>
                <div>
                    <h3 class="recover-title">${isSingle ? 'Recuperar archivo' : `Recuperar ${storagePaths.length} archivos`}</h3>
                    <p class="recover-subtitle">${formatBytes(totalSize)} · elige una sesión destino</p>
                </div>
            </div>

            <div class="recover-section">
                <label class="recover-section-label">Elige sesión existente</label>
                <div class="recover-sessions-list" id="recoverSessionsList">${sessionsListHTML}</div>
            </div>

            <div class="recover-divider"><span>o crea una nueva</span></div>

            <div class="recover-section">
                <label class="recover-section-label" for="recoverNewName">Nombre de la nueva sesión</label>
                <input type="text" id="recoverNewName" class="recover-input" placeholder="Ej. Inspección julio">
            </div>

            ${isSingle ? `
                <div class="recover-options-box" id="recoverOptionsBox" hidden>
                    <div class="recover-options-header">
                        Opciones avanzadas
                        <span class="recover-options-target" id="recoverOptionsTarget"></span>
                    </div>
                    <div class="recover-options-row">
                        <label class="recover-section-label" for="recoverPosition">
                            Posición <span class="recover-optional">(opcional, por defecto al final)</span>
                        </label>
                        <input type="number" id="recoverPosition" class="recover-input recover-input-small" placeholder="ej. 1, 20, ...">
                        <div class="recover-position-hint" id="recoverPositionHint"></div>
                    </div>
                    <div class="recover-options-row">
                        <label class="recover-section-label" for="recoverDescription">
                            Descripción <span class="recover-optional">(opcional)</span>
                        </label>
                        <textarea id="recoverDescription" class="recover-textarea" placeholder="Texto que aparecerá debajo de la foto..." rows="2"></textarea>
                    </div>
                </div>
            ` : ''}

            <div class="recover-footer">
                <button type="button" class="recover-btn-cancel" data-close="true">Cancelar</button>
                <button type="button" class="recover-btn-confirm" id="recoverConfirmBtn" disabled>
                    <span class="recover-btn-confirm-text">Selecciona una sesión</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    let selectedSession = null;
    let isNewSession = false;

    const sessionsList = dialog.querySelector('#recoverSessionsList');
    const newNameInput = dialog.querySelector('#recoverNewName');
    const confirmBtn = dialog.querySelector('#recoverConfirmBtn');
    const confirmText = dialog.querySelector('.recover-btn-confirm-text');
    const optionsBox = dialog.querySelector('#recoverOptionsBox');
    const optionsTarget = dialog.querySelector('#recoverOptionsTarget');
    const positionInput = dialog.querySelector('#recoverPosition');
    const positionHint = dialog.querySelector('#recoverPositionHint');
    const descriptionInput = dialog.querySelector('#recoverDescription');

    function updateConfirmButton() {
        if (!selectedSession && !isNewSession) {
            confirmBtn.disabled = true;
            confirmText.textContent = 'Selecciona una sesión';
            return;
        }
        confirmBtn.disabled = false;
        const target = selectedSession || newNameInput.value.trim();
        confirmText.textContent = isSingle
            ? `Recuperar en "${target}"`
            : `Recuperar ${storagePaths.length} en "${target}"`;
    }

    function showOptionsFor(sessionName, isNew) {
        if (!isSingle || !optionsBox) return;
        optionsBox.hidden = false;
        if (optionsTarget) {
            optionsTarget.textContent = isNew ? `Nueva sesión "${sessionName}"` : `Sesión "${sessionName}"`;
        }
        // Photo count
        let count = 0;
        if (!isNew) {
            const found = sessions.find((s) => s.name === sessionName);
            count = Number(found?.photoCount || 0);
        }
        if (positionHint) {
            positionHint.textContent = isNew
                ? 'La nueva sesión está vacía. Por defecto será la foto 1.'
                : count === 0
                    ? 'La sesión está vacía. Por defecto será la foto 1.'
                    : `Esta sesión tiene ${count} foto${count === 1 ? '' : 's'}. Puedes elegir entre 1 y ${count + 1}.`;
        }
        if (positionInput) {
            positionInput.min = '1';
            positionInput.max = String((count || 0) + 1);
            positionInput.value = '';
        }
    }

    if (sessionsList) {
        sessionsList.querySelectorAll('[data-session-name]').forEach((btn) => {
            btn.addEventListener('click', () => {
                sessionsList.querySelectorAll('[data-session-name]').forEach((b) => b.classList.remove('is-selected'));
                btn.classList.add('is-selected');
                selectedSession = btn.getAttribute('data-session-name');
                isNewSession = false;
                newNameInput.value = '';
                showOptionsFor(selectedSession, false);
                updateConfirmButton();
            });
        });
    }

    newNameInput.addEventListener('input', () => {
        const name = newNameInput.value.trim();
        if (name.length > 0) {
            // Si coincide con una existente, comportarse como existente
            const match = sessions.find((s) => s.name === name);
            if (match) {
                selectedSession = match.name;
                isNewSession = false;
            } else {
                selectedSession = name;
                isNewSession = true;
            }
            sessionsList?.querySelectorAll('[data-session-name]').forEach((b) => b.classList.remove('is-selected'));
            showOptionsFor(selectedSession, isNewSession && !match);
        } else {
            selectedSession = null;
            isNewSession = false;
            if (optionsBox) optionsBox.hidden = true;
        }
        updateConfirmButton();
    });

    let recoverInProgress = false;
    confirmBtn.addEventListener('click', () => {
        if (!selectedSession || recoverInProgress) return;
        recoverInProgress = true;
        confirmBtn.disabled = true;
        confirmText.textContent = 'Recuperando...';
        confirmBtn.classList.add('is-loading');

        const payload = { storagePaths, sessionName: selectedSession };
        if (isSingle) {
            if (positionInput && positionInput.value) {
                const pos = parseInt(positionInput.value, 10);
                if (Number.isFinite(pos) && pos > 0) payload.position = pos;
            }
            if (descriptionInput && descriptionInput.value.trim()) {
                payload.description = descriptionInput.value.trim();
            }
        }

        // Cerrar diálogo inmediato y recuperar en background
        dialog.classList.remove('is-open');
        performOrphanRecover(payload, null).catch(() => {});
    });

    dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-close="true"]')) dialog.classList.remove('is-open');
    });

    requestAnimationFrame(() => {
        dialog.classList.add('is-open');
        // Si hay sesión activa, pre-seleccionarla
        if (currentSessionName) {
            const activeBtn = sessionsList?.querySelector(`[data-session-name="${currentSessionName.replace(/"/g, '&quot;')}"]`);
            if (activeBtn) activeBtn.click();
        }
    });
}

async function performOrphanRecover(payload, dialog) {
    const { storagePaths, sessionName } = payload;
    if (!storagePaths?.length || !sessionName) return;
    showToast(`Recuperando ${storagePaths.length} archivo${storagePaths.length === 1 ? '' : 's'} a "${sessionName}"...`, 'info');
    try {
        const res = await apiFetch('/orphans/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || 'Error al recuperar');
        const noun = result.recovered === 1 ? 'archivo recuperado' : 'archivos recuperados';
        const newMsg = result.createdNew ? ' (sesión creada)' : '';
        const posMsg = result.recovered === 1 && Number.isFinite(result.insertedAt)
            ? ` en la posición ${result.insertedAt}`
            : '';
        showToast(`${result.recovered} ${noun}${posMsg} en "${result.sessionName}"${newMsg}.`, 'success');
        if (dialog) dialog.classList.remove('is-open');
        orphanGalleryState.selected.clear();
        await refreshOrphanGalleryData();
        try {
            if (typeof loadSessionList === 'function') await loadSessionList(currentSessionName || '');
        } catch (_) {}

        // Si recuperamos a la sesión actualmente cargada, recargarla silenciosamente
        if (currentSessionName && result.sessionName === currentSessionName) {
            try {
                await loadSessionFromDB({
                    sessionName: currentSessionName,
                    silent: true,
                    forceServer: true,
                    loaderMessage: 'Actualizando sesión...'
                });
            } catch (reloadError) {
                console.warn('No se pudo recargar la sesión activa tras recuperación:', reloadError);
            }
        }
    } catch (error) {
        showToast(`No se pudo recuperar: ${error.message}`, 'error');
    }
}

async function refreshOrphanGalleryData() {
    await fetchStorageUsage();
    const fresh = Array.isArray(latestStorageUsage?.orphanFiles) ? latestStorageUsage.orphanFiles : [];
    orphanGalleryState.files = fresh;
    orphanGalleryState.totalCount = Number(latestStorageUsage?.orphanFilesCount || fresh.length);
    orphanGalleryState.totalBytes = Number(latestStorageUsage?.orphanBytes || 0);
    const totalPages = Math.max(1, Math.ceil(orphanGalleryState.files.length / ORPHAN_GALLERY_PAGE_SIZE));
    orphanGalleryState.page = Math.min(orphanGalleryState.page, totalPages - 1);
    renderOrphanGalleryPage();
}

async function handleOrphanDelete(storagePath, buttonEl) {
    if (!storagePath) return;
    const fileName = storagePath.split('/').pop() || storagePath;

    const confirmed = await showConfirmDialog({
        title: '¿Eliminar este archivo?',
        message: `<code class="app-confirm-code">${fileName}</code><br>Se borrará permanentemente de Storage.<br><strong>No se puede deshacer.</strong>`,
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        danger: true,
        icon: '🗑️'
    });
    if (!confirmed) return;

    // 1. Animación
    const card = document.querySelector(`.orphan-gallery-card[data-orphan-path="${CSS.escape(storagePath)}"]`);
    const sizeBadge = card?.querySelector('.orphan-gallery-size-badge')?.textContent || '';
    card?.classList.add('is-removing');

    // 2. Optimista
    optimisticallyRemoveFromState([storagePath]);
    setTimeout(() => {
        const totalPages = Math.max(1, Math.ceil(orphanGalleryState.files.length / ORPHAN_GALLERY_PAGE_SIZE));
        orphanGalleryState.page = Math.min(orphanGalleryState.page, totalPages - 1);
        renderOrphanGalleryPage();
    }, 320);

    showToast(`Archivo eliminado${sizeBadge ? ` · ${sizeBadge} liberado` : ''}`, 'success');

    // 3. API en background
    try {
        const res = await apiFetch('/orphans/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storagePaths: [storagePath] })
        });
        const result = await res.json();
        if (!res.ok || !Number.isFinite(result?.deleted)) {
            throw new Error(result?.error || 'No se pudo borrar el archivo.');
        }
        if (result.deleted === 0) {
            showToast('El archivo estaba referenciado, no se borró del Storage. Recargando...', 'info');
            await refreshOrphanGalleryData();
            return;
        }
        fetchStorageUsage();
    } catch (error) {
        showToast(`Error de fondo: ${error.message}. Recargando...`, 'error');
        await refreshOrphanGalleryData();
    }
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
    if (typeof image?.src === 'string' && image.src) return image.src;
    if (typeof image?.imageData === 'string' && image.imageData) return image.imageData;
    if (image?.signedUrl) return image.signedUrl;
    return fallback;
}

function hasPendingLooseUploads() {
    return activeLooseUploadCount > 0
        || pendingLooseUploadQueue.length > 0
        || imagesData.some((img) => img && img._pendingUpload);
}

function notifyLooseUploadDrainIfNeeded() {
    if (hasPendingLooseUploads()) return;
    const resolvers = [...looseUploadDrainResolvers];
    looseUploadDrainResolvers = [];
    resolvers.forEach((resolve) => resolve());
}

function waitForLooseUploadsToFinish() {
    if (!hasPendingLooseUploads()) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        looseUploadDrainResolvers.push(resolve);
    });
}

function cancelScheduledImageDelete(imageId) {
    if (!imageId) return;
    const deleteTimer = pendingImageDeletions.get(imageId);
    if (deleteTimer) {
        clearTimeout(deleteTimer);
        pendingImageDeletions.delete(imageId);
    }
}

function scheduleImageDelete(imageId, delay = 1200) {
    if (!imageId) return;
    cancelScheduledImageDelete(imageId);
    const timer = setTimeout(async () => {
        pendingImageDeletions.delete(imageId);
        try {
            const res = await apiFetch(`/image/${imageId}`, { method: 'DELETE' });
            if (!res.ok) {
                console.warn('No se pudo eliminar la imagen programada:', imageId);
            }
        } catch (error) {
            console.warn('Error eliminando imagen programada:', error);
        }
    }, delay);
    pendingImageDeletions.set(imageId, timer);
}

function createLoosePlaceholderImage(file, index) {
    const localObjectUrl = URL.createObjectURL(file);
    return {
        _id: '',
        _draftId: `loose-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        description: '',
        status: '',
        createdAt: new Date().toISOString(),
        storagePath: '',
        mimeType: file.type || 'image/jpeg',
        signedUrl: '',
        src: localObjectUrl,
        imageData: '',
        _scope: 'library-pending',
        _pendingUpload: true,
        _localObjectUrl: localObjectUrl
    };
}

function readAndResizeImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            resizeImage(e.target.result, 1024, resolve);
        };
        reader.onerror = () => reject(new Error('Error leyendo la imagen.'));
        reader.readAsDataURL(file);
    });
}

function preloadImageSource(src) {
    if (!src) return Promise.resolve(false);
    return new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
    });
}

function queueLooseImageUpload(placeholder, file) {
    pendingLooseUploadQueue.push({
        draftId: placeholder._draftId,
        file
    });
    processLooseUploadQueue();
}

async function syncLooseImageMetadataIfNeeded(image) {
    if (!image || !image._id) return;

    const res = await apiFetch(`/image/${image._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            description: image.description || '',
            status: image.status || ''
        })
    });

    if (!res.ok) {
        console.warn('No se pudo sincronizar la metadata de la imagen cargada en segundo plano.');
    }
}

async function finalizeLooseUploadTask(task) {
    const { draftId, file } = task;
    const currentIndex = imagesData.findIndex((img) => img && img._draftId === draftId);
    let localFallbackDataUrl = '';

    if (currentIndex === -1 || canceledLooseUploadDraftIds.has(draftId)) {
        canceledLooseUploadDraftIds.delete(draftId);
        return;
    }

    try {
        const resizedDataUrl = await readAndResizeImageFile(file);
        localFallbackDataUrl = resizedDataUrl;
        const latestIndex = imagesData.findIndex((img) => img && img._draftId === draftId);

        if (latestIndex === -1 || canceledLooseUploadDraftIds.has(draftId)) {
            canceledLooseUploadDraftIds.delete(draftId);
            return;
        }

        const latestImage = imagesData[latestIndex];
        const initialDescription = latestImage.description || '';
        const initialStatus = latestImage.status || '';

        const res = await apiFetch('/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageData: resizedDataUrl,
                description: initialDescription,
                status: initialStatus
            })
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || 'No se pudo subir la imagen');
        }

        const uploadedImage = await res.json();
        const uploadedIndex = imagesData.findIndex((img) => img && img._draftId === draftId);

        if (uploadedIndex === -1 || canceledLooseUploadDraftIds.has(draftId)) {
            canceledLooseUploadDraftIds.delete(draftId);
            if (uploadedImage && uploadedImage._id) {
                await apiFetch(`/image/${uploadedImage._id}`, { method: 'DELETE' });
            }
            return;
        }

        const liveImage = imagesData[uploadedIndex];
        const remoteSource = getImageDisplaySource(uploadedImage, '');
        let finalSource = liveImage.src;

        if (remoteSource) {
            const remoteReady = await preloadImageSource(remoteSource);
            if (remoteReady) {
                finalSource = remoteSource;
                loadedImagePreviewSources.add(remoteSource);
                if (liveImage._localObjectUrl) {
                    URL.revokeObjectURL(liveImage._localObjectUrl);
                }
            }
        }

        const mergedImage = {
            ...liveImage,
            ...uploadedImage,
            src: finalSource,
            imageData: '',
            _scope: 'library',
            _pendingUpload: false,
            _localObjectUrl: finalSource === remoteSource ? '' : (liveImage._localObjectUrl || '')
        };

        imagesData[uploadedIndex] = mergedImage;
        imageCount = imagesData.length;
        looseUploadCompletedCount = Math.min(looseUploadTotalCount, looseUploadCompletedCount + 1);
        showUploadLoader(looseUploadCompletedCount, looseUploadTotalCount, 'Subiendo fotos');
        renderGrid();
        updateImageCounter();

        if ((mergedImage.description || '') !== initialDescription || (mergedImage.status || '') !== initialStatus) {
            await syncLooseImageMetadataIfNeeded(mergedImage);
        }
    } catch (error) {
        console.error('Error subiendo imagen en segundo plano:', error);
        const failedIndex = imagesData.findIndex((img) => img && img._draftId === draftId);
        if (failedIndex !== -1) {
            imagesData[failedIndex]._pendingUpload = false;
            imagesData[failedIndex]._uploadError = true;
            if (localFallbackDataUrl) {
                imagesData[failedIndex].src = localFallbackDataUrl;
                imagesData[failedIndex].imageData = localFallbackDataUrl;
                if (imagesData[failedIndex]._localObjectUrl) {
                    URL.revokeObjectURL(imagesData[failedIndex]._localObjectUrl);
                    imagesData[failedIndex]._localObjectUrl = '';
                }
            }
        }
        looseUploadCompletedCount = Math.min(looseUploadTotalCount, looseUploadCompletedCount + 1);
        showUploadLoader(looseUploadCompletedCount, looseUploadTotalCount, 'Subiendo fotos');
        showToast(`No se pudo subir "${file?.name || 'la imagen'}" a la base de datos.`, 'error');
        renderGrid();
        updateImageCounter();
    } finally {
        canceledLooseUploadDraftIds.delete(draftId);
        if (!hasPendingLooseUploads()) {
            markSessionDirty(false);
            fetchStorageUsage();
        } else {
            updateCurrentSessionBanner();
        }
    }
}

function processLooseUploadQueue() {
    while (activeLooseUploadCount < MAX_BACKGROUND_LOOSE_UPLOADS && pendingLooseUploadQueue.length > 0) {
        const nextTask = pendingLooseUploadQueue.shift();
        activeLooseUploadCount += 1;

        finalizeLooseUploadTask(nextTask)
            .finally(() => {
                activeLooseUploadCount = Math.max(0, activeLooseUploadCount - 1);
                notifyLooseUploadDrainIfNeeded();
                processLooseUploadQueue();
            });
    }
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
    imagesData.forEach((img) => {
        if (img && img._id) {
            cancelScheduledImageDelete(img._id);
        }
    });
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

    // Mostrar estado de carga visible mientras llega la info
    storageUsageCard.hidden = false;
    storageUsageCard.classList.add('is-loading');
    if (storageUsageMeta) storageUsageMeta.textContent = 'Calculando espacio usado...';
    if (storageUsageDetail) storageUsageDetail.textContent = 'Consultando Supabase...';
    if (storageUsageFiles) storageUsageFiles.textContent = 'Cargando fotos...';
    if (storageUsageFill) storageUsageFill.style.width = '0%';

    try {
        const res = await apiFetch('/usage');
        if (!res.ok) {
            if (res.status >= 500) {
                console.warn('Error servidor en /usage (5xx), ocultando storage card:', res.status);
                storageUsageCard.classList.remove('is-loading');
                storageUsageCard.hidden = true;
                return;
            }
            throw new Error('No se pudo consultar el uso del bucket');
        }

        const usage = await res.json();
        latestStorageUsage = usage;

        // Manejar respuesta con error del backend
        if (usage.error || usage.method === 'error-fallback') {
            console.warn('Backend storage usage con error:', usage.error);
            storageUsageCard.classList.remove('is-loading');
            storageUsageCard.hidden = true;
            showToast(`Storage: ${usage.error?.slice(0, 80)}...`, 'info');
            return;
        }

        const usagePercent = Number.isFinite(usage.usagePercent) ? usage.usagePercent : 0;
        storageUsageCard.hidden = false;
        storageUsageCard.classList.remove('is-loading');
        if (storageUsageFill) storageUsageFill.style.width = `${Math.max(4, usagePercent)}%`;
        if (storageUsageMeta) {
            storageUsageMeta.textContent = usage.filesCount > 0
                ? `${formatBytes(usage.usedBytes)} de ${formatBytes(usage.limitBytes)} usados`
                : `0 B de ${formatBytes(usage.limitBytes)} usados`;
        }
        if (storageUsageDetail) {
            const estimatedNote = usage.estimated ? ' (estimado)' : '';
            storageUsageDetail.textContent = usage.filesCount > 0
                ? `${formatUsagePercent(usagePercent)} del espacio disponible para tus fotos${estimatedNote}`
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
        if (storageUsageCard) {
            storageUsageCard.classList.remove('is-loading');
            storageUsageCard.hidden = true;
            // Toast solo si no es 5xx ya manejado arriba
            if (!error.message.includes('5')) {
                showToast('No disponible info de storage (temporal)', 'info');
            }
        }
        updateDeviceCacheUsage();
    }
}

function clearUploadLoaderAnimation() {
    if (uploadLoaderDisplayTimer) {
        clearInterval(uploadLoaderDisplayTimer);
        uploadLoaderDisplayTimer = null;
    }
}

function animateUploadLoaderCount(current, total) {
    if (!uploadLoaderCount) return;
    clearUploadLoaderAnimation();
    const startCount = uploadLoaderDisplayCount;
    const endCount = Math.max(0, Math.min(total, Number(current || 0)));
    if (startCount >= endCount) {
        uploadLoaderCount.textContent = `${endCount}/${total}`;
        uploadLoaderDisplayCount = endCount;
        return;
    }

    const delta = endCount - startCount;
    const steps = Math.min(delta, 6);
    const stepValue = Math.max(1, Math.ceil(delta / steps));
    let display = startCount;
    uploadLoaderDisplayTimer = setInterval(() => {
        display = Math.min(endCount, display + stepValue);
        uploadLoaderCount.textContent = `${display}/${total}`;
        uploadLoaderDisplayCount = display;
        if (display >= endCount) {
            clearUploadLoaderAnimation();
        }
    }, 75);
}

async function hideUploadLoader() {
    if (uploadLoader) {
        const elapsed = Date.now() - uploadLoaderShownAt;
        const remaining = Math.max(0, 500 - elapsed);
        if (remaining) {
            await new Promise(resolve => setTimeout(resolve, remaining));
        }
        uploadLoader.style.display = 'none';
    }
    uploadLoaderShownAt = 0;
    looseUploadTotalCount = 0;
    looseUploadCompletedCount = 0;
    uploadLoaderDisplayCount = 0;
    clearUploadLoaderAnimation();
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
    try {
        ensureFloatingScrollControls();
        updateImageCounter();
        addSessionControls();
        setupSessionDropdownMenu();
        ensureLooseImagesCountdown();
        ensureSessionAutosave();
        showToast('Conectando con Supabase...', 'info');
        await ensureSupabaseReady();
        showToast('Supabase conectado correctamente.', 'success');
        fetchStorageUsage();
        updateDeviceCacheUsage();
        await restoreInitialWorkspace();
        syncUploadActionsSpacing();
    } catch (error) {
        console.error('No se pudo iniciar la app con Supabase directo:', error);
        showToast(error.message || 'No se pudo conectar con Supabase.', 'error');
    }
}

window.addEventListener('DOMContentLoaded', initializeApp);
window.addEventListener('load', ensureFloatingScrollControls);
window.addEventListener('load', syncUploadActionsSpacing);
window.addEventListener('resize', syncUploadActionsSpacing);

// --- Puente directo a Supabase ---
async function ensureSupabaseReady() {
    if (!window.directSupabaseBridge || typeof window.directSupabaseBridge.ensureReady !== 'function') {
        throw new Error('No se encontró el puente directo de Supabase.');
    }
    return window.directSupabaseBridge.ensureReady();
}

async function resolveApiBaseUrl() {
    if (!window.directSupabaseBridge || typeof window.directSupabaseBridge.resolveApiBaseUrl !== 'function') {
        throw new Error('No se encontró el puente directo de Supabase.');
    }
    return window.directSupabaseBridge.resolveApiBaseUrl();
}

async function apiFetch(path, options) {
    if (!window.directSupabaseBridge || typeof window.directSupabaseBridge.apiFetch !== 'function') {
        throw new Error('No se encontró el puente directo de Supabase.');
    }
    return window.directSupabaseBridge.apiFetch(path, options);
}

// --- Reemplazar localStorage por backend ---
async function saveSession() {
    await waitForLooseUploadsToFinish();
    syncDescriptionsFromDOM();
    const requests = imagesData
        .filter(img => img._id)
        .map(img => {
            const payload = {
                description: img.description,
                status: img.status
            };
            const localSource = typeof img.src === 'string' && img.src.startsWith('data:image/')
                ? img.src
                : (typeof img.imageData === 'string' && img.imageData.startsWith('data:image/') ? img.imageData : '');
            if (localSource) {
                payload.imageData = localSource;
            }
            return apiFetch(`/image/${img._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        });

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
    const res = await apiFetch('/images?includeImageData=true');
    if (!res.ok) {
        throw new Error('No se pudieron cargar las imágenes');
    }
    const data = await res.json();
    imagesData = data.map(img => ({ ...img, src: img.imageData || getImageDisplaySource(img), _scope: 'library' }));
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
        await hideAppLoader(500);
    }
}

// --- Eliminar imagen en backend ---
window.removeImage = async function(idx, event) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    const img = imagesData[idx];
    const isSessionWorkspaceImage = img && (img._scope === 'session' || img._scope === 'session-draft');

    pushUndoState('Eliminar imagen');

    if (!isSessionWorkspaceImage && img && img._id) {
        scheduleImageDelete(img._id);
    }
    if (!isSessionWorkspaceImage && img && img._draftId && (img._pendingUpload || img._scope === 'library-pending')) {
        canceledLooseUploadDraftIds.add(img._draftId);
        if (img._localObjectUrl) {
            URL.revokeObjectURL(img._localObjectUrl);
        }
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
    } else if (!currentSessionName) {
        if (hasPendingLooseUploads()) {
            markSessionDirty(true);
        } else {
            markSessionDirty(false);
            fetchStorageUsage();
        }
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
    } else if (imagesData[idx]._pendingUpload) {
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
    const mustRebuildCounter = imageCounterLastTotal !== total || !counter.querySelector('#imageStartNumberInput');
    if (mustRebuildCounter) {
        imageCounterLastTotal = total;
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
        const input = counter.querySelector('#imageStartNumberInput');
        if (input) {
            input.onchange = function() {
                let val = parseInt(this.value, 10);
                if (isNaN(val) || val < 1) val = 1;
                imageStartNumber = val;
                renderGrid();
                updateImageCounter();
            };
        }
    } else {
        const input = counter.querySelector('#imageStartNumberInput');
        if (input && document.activeElement !== input) {
            input.value = imageStartNumber;
        }
        const totalEl = counter.querySelector('.stat-pill-total .stat-value');
        if (totalEl) totalEl.textContent = String(total);
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

function syncUploadActionsSpacing() {
    // No-op: la separación entre la tarjeta de sesión y la fila de botones
    // ahora se controla 100% por CSS para evitar saltos de layout cuando se
    // carga una sesión (las transiciones de 980ms hacían que las mediciones
    // dinámicas capturaran posiciones incorrectas y los botones quedaban
    // encima del panel).
}

function applyMobileSessionBannerStyles(banner) {
    if (!banner) return;
    const isMobile = window.innerWidth <= 720;
    const meta = banner.querySelector('.current-session-meta');
    const state = banner.querySelector('.current-session-state');
    const autosave = banner.querySelector('.current-session-autosave');
    const copy = banner.querySelector('.current-session-copy');
    const head = banner.querySelector('.current-session-head');
    const name = banner.querySelector('.current-session-name');

    if (isMobile) {
        banner.style.cssText += `
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            flex-wrap: nowrap !important;
            gap: 10px !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
            padding: 14px 16px !important;
            margin-bottom: 18px !important;
            position: relative !important;
            z-index: 5 !important;
        `;
        if (copy) copy.style.cssText += `
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 6px !important;
            flex: 0 0 auto !important;
        `;
        if (head) head.style.cssText += `
            width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
        `;
        if (name) name.style.cssText += `
            position: static !important;
            width: 100% !important;
            transform: none !important;
            text-align: left !important;
            margin-top: 0 !important;
        `;
        if (meta) meta.style.cssText += `
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            justify-content: center !important;
            width: 100% !important;
            gap: 8px !important;
            flex: 0 0 auto !important;
        `;
        if (state) state.style.cssText += `
            width: 100% !important;
            box-sizing: border-box !important;
            justify-content: center !important;
            display: inline-flex !important;
        `;
        if (autosave) autosave.style.cssText += `
            width: 100% !important;
            box-sizing: border-box !important;
            justify-content: center !important;
            display: inline-flex !important;
        `;
    } else {
        banner.style.cssText = '';
        if (copy) copy.style.cssText = '';
        if (head) head.style.cssText = '';
        if (name) name.style.cssText = '';
        if (meta) meta.style.cssText = '';
        if (state) state.style.cssText = '';
        if (autosave) autosave.style.cssText = '';
    }
}

window.addEventListener('resize', () => {
    const banner = document.getElementById('currentSessionBanner');
    if (banner && banner.classList.contains('is-visible')) {
        applyMobileSessionBannerStyles(banner);
    }
});

function updateCurrentSessionBanner() {
    const banner = document.getElementById('currentSessionBanner');
    if (!banner) return;

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

        const nextHtml = `
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
        if (nextHtml === __sessionBannerLastHtml) {
            return;
        }
        __sessionBannerLastHtml = nextHtml;
        banner.innerHTML = nextHtml;
        banner.classList.toggle('is-loose-session', !currentSessionName);
        banner.classList.add('is-visible');
        applyMobileSessionBannerStyles(banner);
    } else {
        __sessionBannerLastHtml = '';
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
    syncUploadActionsSpacing();
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
                label.textContent = 'Guardar Cambios en esta Sesión';
            }
        }
    }

    if (reloadSavedBtn) {
        const canReloadSaved = Boolean(currentSessionName);
        reloadSavedBtn.style.display = canReloadSaved ? 'inline-flex' : 'none';
    }

    syncUploadActionsSpacing();
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

const STATUS_SELECT_META = {
    '': {
        label: 'Sin estado',
        hint: 'Aún no se ha definido',
        toneClass: ''
    },
    verde: {
        label: 'Buen estado',
        hint: 'Lista y conforme',
        toneClass: 'is-verde'
    },
    amarillo: {
        label: 'Observaciones de mejora',
        hint: 'Tiene ajustes por revisar',
        toneClass: 'is-amarillo'
    },
    rojo: {
        label: 'No conformidad. Requiere intervención',
        hint: 'Necesita atención inmediata',
        toneClass: 'is-rojo'
    }
};

function closeAllStatusSelectMenus(exceptWrapper = null) {
    document.querySelectorAll('.status-select-ui.is-open').forEach((wrapper) => {
        if (exceptWrapper && wrapper === exceptWrapper) return;
        wrapper.classList.remove('is-open');
        wrapper.classList.remove('opens-up');
        const trigger = wrapper.querySelector('.status-select-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
}

function positionStatusSelectMenu(wrapper) {
    if (!wrapper) return;
    const menu = wrapper.querySelector('.status-select-menu');
    if (!menu) return;

    wrapper.classList.remove('opens-up');

    const menuRect = menu.getBoundingClientRect();
    const triggerRect = wrapper.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const needsOpenUp = spaceBelow < (menuRect.height + 18);

    if (needsOpenUp) {
        wrapper.classList.add('opens-up');
    }
}

function ensureStatusSelectGlobalHandlers() {
    if (window.__statusSelectGlobalHandlersBound) return;
    window.__statusSelectGlobalHandlersBound = true;

    document.addEventListener('click', (event) => {
        if (event.target.closest('.status-select-ui')) return;
        closeAllStatusSelectMenus();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAllStatusSelectMenus();
        }
    });
}

function buildCustomStatusSelect(select) {
    if (!select || select.dataset.customized === 'true') return;
    ensureStatusSelectGlobalHandlers();
    select.dataset.customized = 'true';
    select.classList.add('status-select-native');

    const wrapper = document.createElement('div');
    wrapper.className = 'status-select-ui';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'status-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const valueWrap = document.createElement('span');
    valueWrap.className = 'status-select-trigger-copy';
    const title = document.createElement('span');
    title.className = 'status-select-trigger-title';
    const hint = document.createElement('span');
    hint.className = 'status-select-trigger-hint';
    valueWrap.append(title, hint);

    const caret = document.createElement('span');
    caret.className = 'status-select-trigger-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.innerHTML = '&#9662;';

    trigger.append(valueWrap, caret);

    const menu = document.createElement('div');
    menu.className = 'status-select-menu';
    menu.setAttribute('role', 'listbox');

    Array.from(select.options).forEach((option) => {
        const meta = STATUS_SELECT_META[option.value] || STATUS_SELECT_META[''];
        const optionBtn = document.createElement('button');
        optionBtn.type = 'button';
        optionBtn.className = 'status-select-option';
        optionBtn.dataset.value = option.value;
        optionBtn.setAttribute('role', 'option');

        const dot = document.createElement('span');
        dot.className = `status-select-option-dot ${meta.toneClass}`;
        dot.setAttribute('aria-hidden', 'true');

        const copy = document.createElement('span');
        copy.className = 'status-select-option-copy';
        const optionTitle = document.createElement('span');
        optionTitle.className = 'status-select-option-title';
        optionTitle.textContent = meta.label;
        const optionHint = document.createElement('span');
        optionHint.className = 'status-select-option-hint';
        optionHint.textContent = meta.hint;
        copy.append(optionTitle, optionHint);

        optionBtn.append(dot, copy);
        optionBtn.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            closeAllStatusSelectMenus();
            trigger.focus();
        });
        menu.appendChild(optionBtn);
    });

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOpen = wrapper.classList.contains('is-open');
        closeAllStatusSelectMenus(wrapper);
        wrapper.classList.toggle('is-open', !isOpen);
        trigger.setAttribute('aria-expanded', String(!isOpen));
        if (!isOpen) {
            requestAnimationFrame(() => positionStatusSelectMenu(wrapper));
        }
    });

    trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            trigger.click();
        }
    });

    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select, trigger, menu);
    updateSelectStyle(select);
}

function updateSelectStyle(select) {
    if (!select) return;
    select.classList.remove('status-verde', 'status-amarillo', 'status-rojo');
    if (select.value === 'verde') select.classList.add('status-verde');
    if (select.value === 'amarillo') select.classList.add('status-amarillo');
    if (select.value === 'rojo') select.classList.add('status-rojo');

    const wrapper = select.closest('.status-select-ui');
    if (!wrapper) return;

    wrapper.classList.remove('status-verde', 'status-amarillo', 'status-rojo');
    if (select.value === 'verde') wrapper.classList.add('status-verde');
    if (select.value === 'amarillo') wrapper.classList.add('status-amarillo');
    if (select.value === 'rojo') wrapper.classList.add('status-rojo');

    const meta = STATUS_SELECT_META[select.value] || STATUS_SELECT_META[''];
    const title = wrapper.querySelector('.status-select-trigger-title');
    const hint = wrapper.querySelector('.status-select-trigger-hint');
    if (title) title.textContent = meta.label;
    if (hint) hint.textContent = meta.hint;

    wrapper.querySelectorAll('.status-select-option').forEach((optionBtn) => {
        const isSelected = optionBtn.dataset.value === select.value;
        optionBtn.classList.toggle('is-selected', isSelected);
        optionBtn.setAttribute('aria-selected', String(isSelected));
    });
}

function validateImageFile(file) {
    if (!file) {
        return 'No se pudo leer el archivo seleccionado.';
    }

    if (!CLIENT_ALLOWED_IMAGE_TYPES.has(file.type)) {
        return `La imagen "${file.name}" no tiene un formato permitido. Usa JPG, PNG, WEBP, GIF, AVIF o HEIC.`;
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
    const loosePlaceholders = [];
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

            if (currentSessionName) {
                const resizedDataUrl = await readAndResizeImageFile(files[i]);
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
                const placeholder = createLoosePlaceholderImage(files[i], i);
                loosePlaceholders.push({ placeholder, file: files[i] });
                imagesData.push(placeholder);
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
    if (!currentSessionName && loosePlaceholders.length > 0) {
        looseUploadTotalCount = loosePlaceholders.length;
        looseUploadCompletedCount = 0;
        showUploadLoader(0, looseUploadTotalCount, 'Subiendo fotos');
        loosePlaceholders.forEach(({ placeholder, file }) => queueLooseImageUpload(placeholder, file));
        markSessionDirty(true);
        await waitForLooseUploadsToFinish();
    }
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
    const scrollEl = getActiveScrollContainer();
    const pageEl = getPageScrollElement();
    const scrollIsViewport = !scrollEl
        || scrollEl === document.body
        || scrollEl === document.documentElement
        || scrollEl === pageEl;
    const savedScrollTop = scrollIsViewport
        ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
        : (scrollEl.scrollTop || 0);
    const restoreScrollPosition = () => {
        if (scrollIsViewport) {
            window.scrollTo(0, savedScrollTop);
        } else if (scrollEl) {
            scrollEl.scrollTop = savedScrollTop;
        }
    };

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
        suppressNextGridEnterAnimation = false;
        ensureImageGridSortable();
        updateScrollControlState();
        if (typeof window.updateScrollBtns === 'function') {
            setTimeout(() => window.updateScrollBtns(), 0);
        }
        restoreScrollPosition();
        return;
    }
    imagesData.forEach((imageData, idx) => {
        imageData.index = imageStartNumber + idx;
        createImageBox(imageData, idx);
    });
    suppressNextGridEnterAnimation = false;
    pendingDropCelebrateIdx = null;
    updateImageCounter(); // <-- Siempre actualiza el contador tras renderizar
    ensureImageGridSortable();
    // --- NUEVO: Si está en modo selección rápida, re-aplicar handlers ---
    if (window.quickStateMode) {
        applyQuickStateHandlers();
    }
    updateScrollControlState();
    if (typeof window.updateScrollBtns === 'function') {
        setTimeout(() => window.updateScrollBtns(), 0);
    }
    restoreScrollPosition();
}

function handleFotoNumberChange(event) {
    const input = event.target;
    const currentIdx = Number(input.getAttribute('data-idx'));
    const requested = parseInt(input.value, 10);

    if (!Number.isInteger(currentIdx) || !imagesData[currentIdx]) return;

    const originalIndex = imagesData[currentIdx].index;
    const minNum = imageStartNumber;
    const maxNum = imageStartNumber + imagesData.length - 1;

    // Número inválido: shake + restaurar valor original con animación
    if (!Number.isFinite(requested) || requested < minNum || requested > maxNum) {
        input.classList.remove('is-invalid');
        // Trigger reflow para reiniciar la animación si ya estaba aplicada
        void input.offsetWidth;
        input.classList.add('is-invalid');
        input.value = String(originalIndex);
        showToast(`Solo hay ${imagesData.length} fotos (del ${minNum} al ${maxNum}).`, 'info');
        setTimeout(() => input.classList.remove('is-invalid'), 700);
        return;
    }

    const targetIdx = requested - imageStartNumber;
    if (targetIdx === currentIdx) {
        input.value = String(originalIndex);
        return;
    }

    input.blur();
    const previousPositions = captureGridCardPositions();
    pushUndoState('Cambiar número de foto');

    const temp = imagesData[currentIdx];
    imagesData[currentIdx] = imagesData[targetIdx];
    imagesData[targetIdx] = temp;

    const movedImage = imagesData[targetIdx];
    const movedUiId = ensureImageUiId(movedImage);

    suppressNextGridEnterAnimation = true;
    pendingDropCelebrateIdx = movedUiId;

    if (currentSessionName) {
        markSessionDirty(true);
    } else if (hasPendingLooseUploads()) {
        markSessionDirty(true);
    } else if (imagesData.length > 0) {
        markSessionDirty(true);
    }

    renderGrid();
    updateImageCounter();

    // Calcular destino del scroll ANTES de aplicar el transform FLIP
    // (si lo medimos después, getBoundingClientRect incluye el transform y centra mal)
    let scrollTargetTop = null;
    const movedCardEl = document.querySelector(`.image-box[data-ui-id="${movedUiId}"]`);
    if (movedCardEl) {
        const cardRect = movedCardEl.getBoundingClientRect();
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        const currentScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const cardCenterAbs = cardRect.top + currentScroll + (cardRect.height / 2);
        const pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        const maxScrollTop = Math.max(0, pageHeight - viewportH);
        scrollTargetTop = Math.max(0, Math.min(maxScrollTop, cardCenterAbs - (viewportH / 2)));
    }

    animateGridReorderFrom(previousPositions, { duration: 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });

    // Scroll suave en paralelo a la animación de las cards (sensación unificada)
    if (scrollTargetTop != null) {
        setTimeout(() => smoothWindowScrollTo(scrollTargetTop, 900), 60);
    }

    showToast(`Foto movida a la posición ${requested}.`, 'success');
}

function smoothWindowScrollTo(targetTop, duration = 800) {
    const startTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const distance = targetTop - startTop;
    if (Math.abs(distance) < 2) return;

    const startedAt = performance.now();
    // Ease-out cubic — coincide con la curva de las cards (cubic-bezier(0.22, 1, 0.36, 1))
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    function step(now) {
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / duration);
        const eased = ease(progress);
        window.scrollTo(0, startTop + (distance * eased));
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function createImageBox(imageData, idx) {
    const div = document.createElement('div');
    const imageUiId = ensureImageUiId(imageData);
    const enterClass = suppressNextGridEnterAnimation ? '' : 'image-enter';
    const dropCelebrateClass = pendingDropCelebrateIdx === imageUiId ? 'image-drop-celebrate' : '';
    div.className = `image-box ${enterClass} ${dropCelebrateClass} ${getCardStatusClass(imageData.status)}`.trim();
    div.setAttribute('data-index', idx);
    div.setAttribute('data-ui-id', imageUiId);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('dragleave', handleDragLeave);
    div.addEventListener('drop', function(e) {
        this.classList.remove('drag-over-animated');
        const indicator = this.querySelector('.drop-indicator');
        if (indicator) indicator.style.display = 'none';

        if (isInternalDrag) {
            return;
        }

        const transferTypes = Array.from(e.dataTransfer?.types || []);
        const hasFiles = transferTypes.includes('Files') && e.dataTransfer?.files?.length > 0;
        if (!hasFiles) {
            return;
        }

        e.preventDefault();

        const liveIdx = Number(this.getAttribute('data-index'));
        if (!Number.isInteger(liveIdx) || !imagesData[liveIdx]) {
            return;
        }

        // Si el drop contiene archivos (imágenes), reemplazar la imagen de esta tarjeta (optimizada)
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
                    imagesData[liveIdx].src = resizedDataUrl;
                    renderGrid();
                    updateImageCounter();
                });
            };
            reader.readAsDataURL(file);
        }
    });
    const displaySource = getImageDisplaySource(imageData);
    const isPendingUpload = Boolean(imageData._pendingUpload || imageData._scope === 'library-pending');
    const shouldShowImageLoader = isPendingUpload && !!displaySource && !loadedImagePreviewSources.has(displaySource);
    div.innerHTML = `
    <button class="remove-image-btn" title="Eliminar imagen" onclick="removeImage(${idx}, event)">×</button>
    <button class="image-reorder-handle" type="button" title="Mantén oprimido para mover esta foto" aria-label="Mantén oprimido para mover esta foto">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3ZM9 10.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3ZM9 16a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3Z" fill="currentColor"></path>
        </svg>
    </button>
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
        <img src="${displaySource}" alt="Imagen ${imageData.index}" style="cursor:crosshair;" class="img-cropper-trigger ${shouldShowImageLoader ? 'is-loading' : ''}" data-idx="${idx}" draggable="false" />
    </div>
    <div class="image-label-desc-row">
        <div class="image-label">
            <span class="image-label-text">Foto</span>
            <input type="number" class="image-label-input" min="1" value="${imageData.index}" data-idx="${idx}" title="Cambia el número para mover esta foto a otra posición" />
        </div>
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
    const reorderHandle = div.querySelector('.image-reorder-handle');
    const imageLoaderStartedAt = Date.now();
    if (reorderHandle) {
        reorderHandle.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handlePointerDragStartIntent.call(div, e);
        });
    }
    const labelInput = div.querySelector('.image-label-input');
    if (labelInput) {
        labelInput.addEventListener('click', (e) => e.stopPropagation());
        labelInput.addEventListener('pointerdown', (e) => e.stopPropagation());
        labelInput.addEventListener('change', handleFotoNumberChange);
        labelInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                labelInput.blur();
            }
        });
    }
    const finishPreviewLoad = () => {
        const elapsed = Date.now() - imageLoaderStartedAt;
        const remaining = Math.max(0, 5000 - elapsed);
        const revealImage = () => {
            if (displaySource) {
                loadedImagePreviewSources.add(displaySource);
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
        if (Date.now() < dragClickSuppressUntil) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        const liveIdx = Number(this.getAttribute('data-idx'));
        if (!window.quickStateMode && Number.isInteger(liveIdx)) {
            showImageCropper(liveIdx);
        }
        e.stopPropagation();
    };
    previewImg.addEventListener('dragstart', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });
    imageContainer.addEventListener('dragstart', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });
    if (!shouldShowImageLoader) {
        finishPreviewLoad();
    } else if (previewImg.complete && previewImg.naturalWidth > 0) {
        requestAnimationFrame(finishPreviewLoad);
    } else {
        previewImg.addEventListener('load', finishPreviewLoad, { once: true });
        previewImg.addEventListener('error', finishPreviewLoad, { once: true });
    }
    previewImg.addEventListener('error', () => {
        if (typeof imageData.imageData === 'string'
            && imageData.imageData.startsWith('data:image/')
            && previewImg.src !== imageData.imageData) {
            previewImg.src = imageData.imageData;
        }
    });
    buildCustomStatusSelect(div.querySelector('.status-select'));
    updateSelectStyle(div.querySelector('.status-select'));
    grid.appendChild(div);
}

function syncVisibleImageCardBindings() {
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.image-box'));
    cards.forEach((box, idx) => {
        const imageData = imagesData[idx];
        if (!imageData) return;

        imageData.index = imageStartNumber + idx;
        box.setAttribute('data-index', idx);

        const removeBtn = box.querySelector('.remove-image-btn');
        if (removeBtn) {
            removeBtn.setAttribute('onclick', `removeImage(${idx}, event)`);
        }

        const previewImg = box.querySelector('.img-cropper-trigger');
        if (previewImg) {
            previewImg.setAttribute('data-idx', idx);
            previewImg.alt = `Imagen ${imageData.index}`;
        }

        const labelInput = box.querySelector('.image-label-input');
        if (labelInput) {
            labelInput.setAttribute('data-idx', String(idx));
            if (document.activeElement !== labelInput) {
                labelInput.value = imageData.index;
            }
        }

        const textarea = box.querySelector('.description');
        if (textarea) {
            textarea.setAttribute('onchange', `updateImageData(${idx}, 'description', this.value)`);
        }

        const select = box.querySelector('.status-select');
        if (select) {
            select.setAttribute('onchange', `updateImageData(${idx}, 'status', this.value); updateSelectStyle(this)`);
        }
    });

    updateImageCounter();
    if (typeof window.updateScrollBtns === 'function') {
        setTimeout(() => window.updateScrollBtns(), 0);
    }
}

function triggerImageDropCelebrate(cardEl) {
    if (!cardEl) return;

    cardEl.classList.remove('image-drop-celebrate');
    void cardEl.offsetWidth;
    cardEl.classList.add('image-drop-celebrate');
    window.setTimeout(() => {
        cardEl.classList.remove('image-drop-celebrate');
    }, 760);
}

function cleanupSortableVisualState(cardEl) {
    if (!cardEl) return;
    cardEl.classList.remove('image-drag-picked', 'sortable-hover-target');
    const indicator = cardEl.querySelector('.drop-indicator');
    if (indicator) indicator.style.display = 'none';
}

let sortableDragSession = null;
let sortableCursorGhost = null;
let sortablePendingPick = null;
let sortableAutoScrollTicking = false;

function updateSortableDragPointerFromEvent(eventLike) {
    if (!sortableDragSession || !eventLike) return;

    const point = eventLike.touches?.[0]
        || eventLike.changedTouches?.[0]
        || eventLike;

    if (typeof point.clientX !== 'number' || typeof point.clientY !== 'number') {
        return;
    }

    sortableDragSession.pointerX = point.clientX;
    sortableDragSession.pointerY = point.clientY;
    updateSortableCursorGhostPosition();
}

function getSortableFallbackGhostRect() {
    return document.querySelector('.sortable-fallback')?.getBoundingClientRect?.() || null;
}

function removeSortableCursorGhost() {
    if (!sortableCursorGhost) return;
    sortableCursorGhost.remove();
    sortableCursorGhost = null;
}

function updateSortableCursorGhostPosition() {
    if (!sortableDragSession || !sortableCursorGhost) return;
    if (!Number.isFinite(sortableDragSession.pointerX) || !Number.isFinite(sortableDragSession.pointerY)) return;

    const left = sortableDragSession.pointerX - (sortableDragSession.grabOffsetX || 0);
    const top = sortableDragSession.pointerY - (sortableDragSession.grabOffsetY || 0);
    sortableCursorGhost.style.left = `${left}px`;
    sortableCursorGhost.style.top = `${top}px`;
}

function getPageScrollElement() {
    return document.scrollingElement || document.documentElement || document.body;
}

function getActiveScrollContainer() {
    let node = grid;

    while (node && node !== document.body && node !== document.documentElement) {
        const style = window.getComputedStyle(node);
        const overflowY = style?.overflowY || style?.overflow || '';
        const canScroll = /(auto|scroll|overlay)/i.test(overflowY) && node.scrollHeight > node.clientHeight + 4;
        if (canScroll) {
            return node;
        }
        node = node.parentElement;
    }

    return getPageScrollElement();
}

function scrollPageBy(deltaY) {
    const primaryScrollEl = getActiveScrollContainer();
    if (!primaryScrollEl || !Number.isFinite(deltaY) || deltaY === 0) {
        return 0;
    }

    const candidates = [
        primaryScrollEl,
        document.scrollingElement,
        document.documentElement,
        document.body
    ].filter(Boolean).filter((node, index, list) => list.indexOf(node) === index);

    let appliedDelta = 0;

    candidates.forEach((scrollEl) => {
        const viewportHeight = scrollEl.clientHeight || window.innerHeight || document.documentElement.clientHeight || 0;
        const maxScrollTop = Math.max(0, (scrollEl.scrollHeight || 0) - viewportHeight);
        const currentScrollTop = scrollEl.scrollTop || 0;
        const nextScrollTop = Math.min(maxScrollTop, Math.max(0, currentScrollTop + deltaY));

        if (nextScrollTop === currentScrollTop) {
            return;
        }

        scrollEl.scrollTop = nextScrollTop;
        appliedDelta = Math.max(appliedDelta, Math.abs(nextScrollTop - currentScrollTop)) * Math.sign(deltaY);
    });

    if (appliedDelta !== 0 && typeof window.scrollTo === 'function') {
        const globalTop = document.scrollingElement?.scrollTop
            || document.documentElement.scrollTop
            || document.body.scrollTop
            || 0;
        window.scrollTo(0, globalTop);
    }

    return appliedDelta;
}

function createSortableCursorGhost(sourceEl) {
    removeSortableCursorGhost();
    if (!sourceEl) return;

    const rect = sourceEl.getBoundingClientRect();
    sortableCursorGhost = sourceEl.cloneNode(true);
    sortableCursorGhost.classList.remove(
        'sortable-ghost',
        'sortable-chosen',
        'sortable-drag',
        'image-drag-picked',
        'sortable-hover-target',
        'drag-over-animated',
        'image-drop-celebrate',
        'is-reorder-animating',
        'image-enter'
    );
    sortableCursorGhost.classList.add('sortable-cursor-ghost');

    sortableCursorGhost.querySelectorAll('.drop-indicator').forEach((indicator) => {
        indicator.remove();
    });

    sortableCursorGhost.style.position = 'fixed';
    sortableCursorGhost.style.left = '0';
    sortableCursorGhost.style.top = '0';
    sortableCursorGhost.style.width = `${Math.round(rect.width)}px`;
    sortableCursorGhost.style.maxWidth = `${Math.round(rect.width)}px`;
    sortableCursorGhost.style.margin = '0';
    sortableCursorGhost.style.pointerEvents = 'none';
    sortableCursorGhost.style.zIndex = '100001';
    document.body.appendChild(sortableCursorGhost);
    updateSortableCursorGhostPosition();
}

function clearSortableHoverTarget() {
    if (!sortableDragSession?.hoverTarget) return;
    cleanupSortableVisualState(sortableDragSession.hoverTarget);
    sortableDragSession.hoverTarget = null;
}

function setSortableHoverTarget(targetEl) {
    if (!sortableDragSession) return;

    const nextTarget = targetEl && targetEl !== sortableDragSession.draggedItem && targetEl.classList?.contains('image-box')
        ? targetEl
        : null;

    if (sortableDragSession.hoverTarget === nextTarget) {
        return;
    }

    clearSortableHoverTarget();

    if (!nextTarget) {
        return;
    }

    sortableDragSession.hoverTarget = nextTarget;
    nextTarget.classList.add('sortable-hover-target');
    const indicator = nextTarget.querySelector('.drop-indicator');
    if (indicator) indicator.style.display = 'block';
}

function computeSortableAutoScrollDelta() {
    if (!sortableDragSession?.active) return 0;

    const ghostRect = sortableCursorGhost?.getBoundingClientRect?.() || getSortableFallbackGhostRect();
    const pointerY = Number.isFinite(sortableDragSession.pointerY) ? sortableDragSession.pointerY : null;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    if (!ghostRect && !Number.isFinite(pointerY)) {
        return 0;
    }

    const scrollMargin = 180;
    const minSpeed = 3;
    const maxSpeed = 14;
    const topProbe = ghostRect ? ghostRect.top : pointerY;
    const bottomProbe = ghostRect ? ghostRect.bottom : pointerY;

    if (topProbe < scrollMargin) {
        const raw = Math.min(1, (scrollMargin - topProbe) / scrollMargin);
        return -Math.max(minSpeed, Math.round(maxSpeed * raw * raw));
    }

    if (bottomProbe > viewportHeight - scrollMargin) {
        const raw = Math.min(1, (bottomProbe - (viewportHeight - scrollMargin)) / scrollMargin);
        return Math.max(minSpeed, Math.round(maxSpeed * raw * raw));
    }

    return 0;
}

function nudgeSortableWithSyntheticMove() {
    if (!sortableDragSession) return;

    const clientX = sortableDragSession.pointerX;
    const clientY = sortableDragSession.pointerY;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return;
    }

    try {
        if (window.PointerEvent) {
            document.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true,
                cancelable: true,
                clientX,
                clientY,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        }
    } catch (_error) {
        // Ignorar y usar mousemove.
    }

    try {
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            view: window
        }));
    } catch (_error) {
        // Ignorar.
    }
}

function runSortableAutoScrollFrame() {
    if (sortableAutoScrollTicking || !sortableDragSession?.active) {
        return;
    }

    sortableAutoScrollTicking = true;
    try {
        const probeX = Math.min(
            Math.max(12, sortableDragSession.pointerX || 0),
            Math.max(12, window.innerWidth - 12)
        );
        const probeY = Math.min(
            Math.max(12, sortableDragSession.pointerY || 0),
            Math.max(12, window.innerHeight - 12)
        );

        const hoveredCard = document.elementFromPoint(
            probeX,
            probeY
        )?.closest?.('.image-box');
        setSortableHoverTarget(hoveredCard);

        const scrollAmount = computeSortableAutoScrollDelta();
        if (scrollAmount) {
            const appliedScroll = scrollPageBy(scrollAmount);
            if (appliedScroll !== 0) {
                nudgeSortableWithSyntheticMove();
                updateSortableCursorGhostPosition();
            }
        }
    } finally {
        sortableAutoScrollTicking = false;
    }
}

function startSortableAutoScroll() {
    if (!sortableDragSession || sortableDragSession.intervalId) return;
    sortableDragSession.active = true;
    runSortableAutoScrollFrame();
    sortableDragSession.intervalId = window.setInterval(runSortableAutoScrollFrame, 16);
}

function stopSortableAutoScroll() {
    if (!sortableDragSession?.intervalId) return;
    window.clearInterval(sortableDragSession.intervalId);
    sortableDragSession.intervalId = 0;
}

function handleSortableDocumentPointerMove(eventLike) {
    updateSortableDragPointerFromEvent(eventLike);
    runSortableAutoScrollFrame();
}

function beginSortableDragSession(itemEl, originalEvent, grabOffsetX, grabOffsetY) {
    sortableDragSession = {
        active: false,
        pointerX: NaN,
        pointerY: NaN,
        intervalId: 0,
        draggedItem: itemEl,
        hoverTarget: null,
        startPositions: captureGridCardPositions(),
        grabOffsetX,
        grabOffsetY
    };

    updateSortableDragPointerFromEvent(originalEvent);
    createSortableCursorGhost(itemEl);
    document.addEventListener('pointermove', handleSortableDocumentPointerMove, true);
    document.addEventListener('mousemove', handleSortableDocumentPointerMove, true);
    document.addEventListener('touchmove', handleSortableDocumentPointerMove, true);
    document.addEventListener('dragover', handleSortableDocumentPointerMove, true);
    window.addEventListener('pointermove', handleSortableDocumentPointerMove, true);
    window.addEventListener('mousemove', handleSortableDocumentPointerMove, true);
    window.addEventListener('touchmove', handleSortableDocumentPointerMove, true);
}

function finishSortableDragSession() {
    const finishedSession = sortableDragSession;
    stopSortableAutoScroll();
    clearSortableHoverTarget();
    removeSortableCursorGhost();
    document.removeEventListener('pointermove', handleSortableDocumentPointerMove, true);
    document.removeEventListener('mousemove', handleSortableDocumentPointerMove, true);
    document.removeEventListener('touchmove', handleSortableDocumentPointerMove, true);
    document.removeEventListener('dragover', handleSortableDocumentPointerMove, true);
    window.removeEventListener('pointermove', handleSortableDocumentPointerMove, true);
    window.removeEventListener('mousemove', handleSortableDocumentPointerMove, true);
    window.removeEventListener('touchmove', handleSortableDocumentPointerMove, true);
    sortableDragSession = null;
    return finishedSession;
}

function ensureImageGridSortable() {
    return;
}

// --- Cropper: abrir desde miniatura ---
window.showImageCropper = function(idx) {
    openCropper(idx);
};

let dragSrcIdx = null;
let autoScrollFrame = null;
let autoScrollInterval = null;
let currentDragGhost = null;
let pointerDragState = null;
let dragHoverIdx = null;
let dragClickSuppressUntil = 0;
let suppressNextGridEnterAnimation = false;
let pendingDropCelebrateIdx = null;

function clearNativeSelection() {
    try {
        const selection = window.getSelection ? window.getSelection() : null;
        if (selection && selection.rangeCount) {
            selection.removeAllRanges();
        }
    } catch (_error) {
        // Ignorar.
    }
}

function clearDragIndicators() {
    document.querySelectorAll('.image-box').forEach((box) => {
        box.classList.remove('drag-over-animated', 'is-pointer-drag-source', 'is-reorder-animating');
        box.style.transition = '';
        box.style.transform = '';
        const indicator = box.querySelector('.drop-indicator');
        if (indicator) indicator.style.display = 'none';
    });
}

function captureGridCardPositions() {
    const positions = new Map();
    document.querySelectorAll('.image-box[data-ui-id]').forEach((box) => {
        positions.set(box.getAttribute('data-ui-id'), box.getBoundingClientRect());
    });
    return positions;
}

function animateGridReorderFrom(previousPositions = new Map(), options = {}) {
    if (!previousPositions || !previousPositions.size) return;

    const excludeUiId = options?.excludeUiId || null;
    const duration = Number(options?.duration) || 460;
    const easing = options?.easing || 'cubic-bezier(0.22, 1, 0.36, 1)';

    requestAnimationFrame(() => {
        document.querySelectorAll('.image-box[data-ui-id]').forEach((box) => {
            const uiId = box.getAttribute('data-ui-id');
            if (excludeUiId && uiId === excludeUiId) return;
            const previousRect = previousPositions.get(uiId);
            if (!previousRect) return;

            const nextRect = box.getBoundingClientRect();
            const deltaX = previousRect.left - nextRect.left;
            const deltaY = previousRect.top - nextRect.top;

            if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

            box.classList.add('is-reorder-animating');
            box.style.transition = 'none';
            box.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.985)`;

            requestAnimationFrame(() => {
                box.style.transition = `transform ${duration}ms ${easing}`;
                box.style.transform = 'translate(0, 0) scale(1)';
                box.addEventListener('transitionend', () => {
                    box.classList.remove('is-reorder-animating');
                    box.style.transition = '';
                    box.style.transform = '';
                }, { once: true });
            });
        });
    });
}

function removeCurrentDragGhost() {
    if (!currentDragGhost) return;
    currentDragGhost.remove();
    currentDragGhost = null;
}

function updateCurrentDragGhostPosition(clientX, clientY) {
    if (!currentDragGhost) return;
    currentDragGhost.style.left = `${clientX}px`;
    currentDragGhost.style.top = `${clientY}px`;
}

function getViewportScrollState() {
    const scrollEl = getActiveScrollContainer();
    const scrollTop = scrollEl?.scrollTop || window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const scrollHeight = Math.max(
        scrollEl?.scrollHeight || 0,
        document.documentElement.scrollHeight || 0,
        document.body.scrollHeight || 0,
        document.documentElement.offsetHeight || 0,
        document.body.offsetHeight || 0
    );
    const viewportHeight = scrollEl?.clientHeight || window.innerHeight || document.documentElement.clientHeight || 0;

    return {
        scrollTop,
        maxScrollTop: Math.max(0, scrollHeight - viewportHeight)
    };
}

function computePointerDragScrollDelta() {
    const ghostRect = currentDragGhost?.getBoundingClientRect?.();
    if (!ghostRect) return 0;

    const scrollMargin = 210;
    const maxScrollSpeed = 38;
    const pointerY = pointerDragState?.lastClientY ?? ((ghostRect.top + ghostRect.bottom) / 2);
    const topProbe = Math.min(ghostRect.top, pointerY);
    const bottomProbe = Math.max(ghostRect.bottom, pointerY);

    if (topProbe < scrollMargin) {
        const intensity = Math.min(1, (scrollMargin - topProbe) / scrollMargin);
        return -Math.max(10, Math.round(maxScrollSpeed * intensity));
    }

    if (bottomProbe > window.innerHeight - scrollMargin) {
        const intensity = Math.min(1, (bottomProbe - (window.innerHeight - scrollMargin)) / scrollMargin);
        return Math.max(10, Math.round(maxScrollSpeed * intensity));
    }

    return 0;
}

function stopPointerDragAutoScroll() {
    if (!autoScrollFrame) return;
    cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = null;
}

function resolveDropTargetIndex(clientX, clientY) {
    const hoveredCard = document.elementFromPoint(clientX, clientY)?.closest('.image-box');
    if (hoveredCard && !hoveredCard.classList.contains('is-pointer-drag-source')) {
        const hoveredIdx = Number(hoveredCard.getAttribute('data-index'));
        if (Number.isInteger(hoveredIdx)) {
            return hoveredIdx;
        }
    }

    const cards = Array.from(document.querySelectorAll('.image-box')).filter((box) => !box.classList.contains('is-pointer-drag-source'));
    let nearestIdx = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((box) => {
        const rect = box.getBoundingClientRect();
        const boxCenterX = rect.left + (rect.width / 2);
        const boxCenterY = rect.top + (rect.height / 2);
        const distance = Math.hypot(clientX - boxCenterX, clientY - boxCenterY);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIdx = Number(box.getAttribute('data-index'));
        }
    });

    return Number.isInteger(nearestIdx) ? nearestIdx : null;
}

function setDragHoverTarget(targetIdx) {
    dragHoverIdx = Number.isInteger(targetIdx) ? targetIdx : null;
    document.querySelectorAll('.image-box').forEach((box) => {
        const boxIdx = Number(box.getAttribute('data-index'));
        const indicator = box.querySelector('.drop-indicator');
        const isHoverTarget = dragHoverIdx !== null && boxIdx === dragHoverIdx && boxIdx !== dragSrcIdx;
        box.classList.toggle('drag-over-animated', isHoverTarget);
        if (indicator) indicator.style.display = isHoverTarget ? 'block' : 'none';
    });
}

function syncPointerDragVisuals() {
    if (!pointerDragState?.dragging) return;
    updateCurrentDragGhostPosition(pointerDragState.lastClientX, pointerDragState.lastClientY);
    setDragHoverTarget(resolveDropTargetIndex(pointerDragState.lastClientX, pointerDragState.lastClientY));
}

function stopPointerDragAutoScroll() {
    if (autoScrollFrame) {
        cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = null;
    }
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
}

function runPointerDragAutoScroll() {
    if (!pointerDragState?.dragging) {
        stopPointerDragAutoScroll();
        return;
    }

    const scrollContainer = getActiveScrollContainer();
    const clientY = pointerDragState.lastClientY;
    const scrollMargin = 180;
    const viewportRect = scrollContainer === document.body || scrollContainer === document.documentElement || scrollContainer === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight || document.documentElement.clientHeight || 0 }
        : scrollContainer.getBoundingClientRect();
    const viewportHeight = Math.max(0, viewportRect.bottom - viewportRect.top);
    const { scrollTop, maxScrollTop } = getViewportScrollState();
    
    // Obtener posición de la card que estamos arrastrando
    let ghostBounds = null;
    if (currentDragGhost) {
        ghostBounds = currentDragGhost.getBoundingClientRect();
    }
    
    let scrollAmount = 0;

    // Velocidad reducida y curva exponencial para arranque suave
    const minSpeed = 3;
    const maxSpeed = 14;

    // Chequear BORDE SUPERIOR: cursor o card cerca del top
    const topProbe = ghostBounds ? Math.min(clientY, ghostBounds.top) - viewportRect.top : clientY - viewportRect.top;
    if (topProbe < scrollMargin) {
        const rawIntensity = Math.min(1, (scrollMargin - topProbe) / scrollMargin);
        const easedIntensity = rawIntensity * rawIntensity; // ease-in cuadrático
        scrollAmount = -Math.max(minSpeed, Math.round(maxSpeed * easedIntensity));
    }

    // Chequear BORDE INFERIOR: cursor o card cerca del bottom
    const bottomProbe = ghostBounds ? Math.max(clientY, ghostBounds.bottom) - viewportRect.top : clientY - viewportRect.top;
    if (bottomProbe > viewportHeight - scrollMargin) {
        const rawIntensity = Math.min(1, (bottomProbe - (viewportHeight - scrollMargin)) / scrollMargin);
        const easedIntensity = rawIntensity * rawIntensity; // ease-in cuadrático
        scrollAmount = Math.max(minSpeed, Math.round(maxSpeed * easedIntensity));
    }

    // Si hay que hacer scroll y no estamos en los límites
    if (scrollAmount !== 0) {
        if ((scrollAmount < 0 && scrollTop > 0) || (scrollAmount > 0 && scrollTop < maxScrollTop)) {
            const appliedScroll = scrollPageBy(scrollAmount);
            if (appliedScroll !== 0) {
                syncPointerDragVisuals();
            }
        }
    }
}

function startPointerDragAutoScroll() {
    if (autoScrollInterval) return;
    autoScrollInterval = setInterval(runPointerDragAutoScroll, 16);
}

function finishPointerDrag() {
    if (pointerDragState?.sourceEl) {
        pointerDragState.sourceEl.classList.remove('is-pointer-drag-source');
    }

    removeCurrentDragGhost();
    clearDragIndicators();
    stopPointerDragAutoScroll();

    document.body.classList.remove('image-reorder-active');
    document.body.classList.remove('image-reorder-armed');
    document.removeEventListener('pointermove', handlePointerDragMove, true);
    document.removeEventListener('pointerup', handlePointerDragEnd, true);
    document.removeEventListener('pointercancel', handlePointerDragEnd, true);
    clearNativeSelection();

    if (pointerDragState?.sourceEl?.releasePointerCapture && pointerDragState.sourceEl.hasPointerCapture?.(pointerDragState.pointerId)) {
        pointerDragState.sourceEl.releasePointerCapture(pointerDragState.pointerId);
    }

    pointerDragState = null;
    dragHoverIdx = null;
    dragSrcIdx = null;
    isInternalDrag = false;
}

function beginPointerDrag() {
    if (!pointerDragState || pointerDragState.dragging) return;

    pointerDragState.dragging = true;
    dragSrcIdx = pointerDragState.index;
    isInternalDrag = true;
    document.body.classList.add('image-reorder-active');
    clearNativeSelection();
    pointerDragState.sourceEl.classList.add('is-pointer-drag-source');

    if (pointerDragState.sourceEl.setPointerCapture) {
        pointerDragState.sourceEl.setPointerCapture(pointerDragState.pointerId);
    }

    const rect = pointerDragState.sourceEl.getBoundingClientRect();
    currentDragGhost = pointerDragState.sourceEl.cloneNode(true);
    currentDragGhost.classList.remove('is-pointer-drag-source', 'drag-over-animated', 'image-enter', 'image-drop-celebrate', 'is-reorder-animating');
    currentDragGhost.classList.add('pointer-drag-ghost');
    currentDragGhost.style.position = 'fixed';
    currentDragGhost.style.left = '0';
    currentDragGhost.style.top = '0';
    currentDragGhost.style.width = `${Math.round(rect.width)}px`;
    currentDragGhost.style.maxWidth = `${Math.round(rect.width)}px`;
    currentDragGhost.style.margin = '0';
    currentDragGhost.style.opacity = '1';
    currentDragGhost.style.pointerEvents = 'none';
    currentDragGhost.style.zIndex = '100000';
    currentDragGhost.style.transform = 'translate(-50%, -50%) rotate(-0.5deg) scale(0.98)';
    currentDragGhost.style.boxShadow = '0 30px 60px rgba(15, 23, 42, 0.3)';
    document.body.appendChild(currentDragGhost);

    syncPointerDragVisuals();
    startPointerDragAutoScroll();
}

function handlePointerDragStartIntent(e) {
    if (e.pointerType !== 'touch' && e.button !== 0) return;

    const loadingTarget = e.target.closest && e.target.closest('.image-loading-state');
    if (loadingTarget) return;

    document.body.classList.add('image-reorder-armed');
    clearNativeSelection();

    let dragThreshold = 8;
    if (e.target.closest && e.target.closest('textarea')) {
        dragThreshold = 18;
    } else if (e.target.closest && e.target.closest('select, input')) {
        dragThreshold = 16;
    } else if (e.target.closest && e.target.closest('button')) {
        dragThreshold = e.pointerType === 'touch' ? 6 : 8;
    } else if (e.target.closest && e.target.closest('.img-cropper-trigger')) {
        dragThreshold = 8;
    }

    pointerDragState = {
        pointerId: e.pointerId,
        sourceEl: this,
        index: Number(this.getAttribute('data-index')),
        startX: e.clientX,
        startY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        dragThreshold,
        dragging: false
    };

    document.addEventListener('pointermove', handlePointerDragMove, true);
    document.addEventListener('pointerup', handlePointerDragEnd, true);
    document.addEventListener('pointercancel', handlePointerDragEnd, true);
}

function handlePointerDragMove(e) {
    if (!pointerDragState || e.pointerId !== pointerDragState.pointerId) return;

    pointerDragState.lastClientX = e.clientX;
    pointerDragState.lastClientY = e.clientY;

    if (!pointerDragState.dragging) {
        const movedEnough = Math.hypot(e.clientX - pointerDragState.startX, e.clientY - pointerDragState.startY) >= pointerDragState.dragThreshold;
        if (!movedEnough) return;
        beginPointerDrag();
    }

    e.preventDefault();
    clearNativeSelection();
    syncPointerDragVisuals();
    startPointerDragAutoScroll();
}

function handlePointerDragEnd(e) {
    if (!pointerDragState || e.pointerId !== pointerDragState.pointerId) return;

    const shouldReorder = pointerDragState.dragging && dragHoverIdx !== null && dragHoverIdx !== dragSrcIdx;
    if (shouldReorder) {
        const previousPositions = captureGridCardPositions();
        pushUndoState('Reordenar imágenes');
        const moved = imagesData.splice(dragSrcIdx, 1)[0];
        imagesData.splice(dragHoverIdx, 0, moved);
        markSessionDirty(true);
        dragClickSuppressUntil = Date.now() + 250;
        suppressNextGridEnterAnimation = true;
        pendingDropCelebrateIdx = ensureImageUiId(moved);
        finishPointerDrag();
        renderGrid();
        animateGridReorderFrom(previousPositions);
        return;
    }

    if (pointerDragState.dragging) {
        dragClickSuppressUntil = Date.now() + 120;
    }

    finishPointerDrag();
}

function handleDragOver(e) {
    const transferTypes = Array.from(e.dataTransfer?.types || []);
    if (isInternalDrag || !transferTypes.includes('Files')) {
        return;
    }

    e.preventDefault();
    this.classList.add('drag-over-animated');
    // Mostrar indicador visual
    const indicator = this.querySelector('.drop-indicator');
    if (indicator) {
        indicator.style.display = 'block';
    }
}

function handleDragLeave(e) {
    const transferTypes = Array.from(e.dataTransfer?.types || []);
    if (isInternalDrag || !transferTypes.includes('Files')) {
        return;
    }

    this.classList.remove('drag-over-animated');
    const indicator = this.querySelector('.drop-indicator');
    if (indicator) {
        indicator.style.display = 'none';
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
let cropperOriginalSrc = '';
let cropperHasChanges = false;
let cropperBaseSrc = '';
let cropperSelectionMode = false;
let cropperPreviewActive = false;
const cropperHint = document.getElementById('cropperHint');

function updateCropperActionButton() {
    const actionBtn = document.getElementById('cropperOkBtn');
    const cropBtn = document.getElementById('cropperCropBtn');
    const rotateBtn = document.getElementById('cropperRotateBtn');
    if (!actionBtn) return;
    actionBtn.textContent = 'Guardar cambios nuevos';
    if (cropperHasChanges) {
        actionBtn.style.display = '';
        actionBtn.disabled = false;
    } else {
        actionBtn.style.display = 'none';
        actionBtn.disabled = true;
    }
    if (cropBtn) {
        if (cropperSelectionMode) {
            cropBtn.textContent = cropStart && cropEnd ? 'Aplicar recorte' : 'Seleccionando...';
        } else {
            cropBtn.textContent = (cropperPreviewActive && cropperHasChanges) ? 'Recortar de nuevo' : 'Recortar';
        }
        cropBtn.classList.toggle('is-armed', cropperSelectionMode);
    }
    if (rotateBtn) {
        rotateBtn.style.display = cropperSelectionMode ? 'none' : '';
    }
    if (cropperHint) {
        if (cropperSelectionMode) {
            cropperHint.textContent = 'Arrastra sobre la foto para marcar el área que quieres conservar.';
        } else if (cropperPreviewActive) {
            cropperHint.textContent = 'Así quedó el recorte. Puedes volver a recortar, girar o guardar estos cambios nuevos.';
        } else {
            cropperHint.textContent = 'Toca Recortar para marcar el área que quieres conservar.';
        }
    }
    if (cropperCanvas) {
        cropperCanvas.classList.toggle('cropper-selecting', cropperSelectionMode);
        cropperCanvas.style.cursor = cropperSelectionMode ? 'crosshair' : 'grab';
    }
}

function setCropperImageSource(src, options = {}) {
    const {
        updateBase = false,
        previewActive = false,
        markChanged = true,
        enterSelection = false
    } = options;
    const nextImg = new window.Image();
    nextImg.onload = function() {
        cropperImg = nextImg;
        cropStart = null;
        cropEnd = null;
        cropperSelectionMode = enterSelection;
        cropperPreviewActive = previewActive;
        if (updateBase) {
            cropperBaseSrc = src;
        }
        drawCropperImage();
        cropperHasChanges = markChanged
            ? cropperImg.src !== cropperOriginalSrc
            : false;
        updateCropperActionButton();
    };
    nextImg.src = src;
}

function applyCropperRotation() {
    if (!cropperImg || !cropperImg.naturalWidth || !cropperImg.naturalHeight) return;
    cropperSelectionMode = false;

    // Si hay trazos pendientes, hornearlos antes de rotar
    const baked = typeof markStrokes !== 'undefined' && markStrokes.length > 0 ? bakeMarkStrokes() : null;
    const sourceImage = baked ? null : cropperImg;

    const doRotate = (img) => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = h;
        tempCanvas.height = w;
        const tctx = tempCanvas.getContext('2d');
        tctx.translate(h, 0);
        tctx.rotate(Math.PI / 2);
        tctx.drawImage(img, 0, 0, w, h);
        markStrokes = [];
        setCropperImageSource(tempCanvas.toDataURL('image/png'), {
            updateBase: true,
            previewActive: false,
            markChanged: true
        });
    };

    if (baked) {
        const bakedImg = new window.Image();
        bakedImg.onload = () => doRotate(bakedImg);
        bakedImg.src = baked;
    } else if (sourceImage) {
        doRotate(sourceImage);
    }
}

function applyCropperSelection(autoApply = false) {
    if (autoApply && autoApply instanceof Event) {
        autoApply = false;
    }
    if (!autoApply) {
        if (cropperSelectionMode && cropStart && cropEnd) {
            // Ya hay una selección, ahora aplicamos el recorte.
            cropperSelectionMode = false;
            cropperPreviewActive = true;
            autoApply = true;
        } else if (cropperPreviewActive && !cropperSelectionMode) {
            // Recortar de nuevo debe comenzar desde la imagen original cargada, no desde el último recorte.
            setCropperImageSource(cropperOriginalSrc, {
                enterSelection: true,
                previewActive: false,
                markChanged: true
            });
            return;
        } else {
            cropperSelectionMode = true;
            cropperPreviewActive = false;
            cropStart = null;
            cropEnd = null;
            drawCropperImage();
            updateCropperActionButton();
            return;
        }
    }

    if (!cropStart || !cropEnd) {
        cropperSelectionMode = false;
        updateCropperActionButton();
        return;
    }
    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);
    if (w < 10 || h < 10) {
        updateCropperActionButton();
        return;
    }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = Math.round(w);
    tempCanvas.height = Math.round(h);
    const tctx = tempCanvas.getContext('2d');
    tctx.drawImage(cropperImg, x, y, w, h, 0, 0, w, h);
    setCropperImageSource(tempCanvas.toDataURL('image/png'), {
        updateBase: false,
        previewActive: true,
        markChanged: true
    });
}

function openCropper(idx) {
    croppingIdx = idx;
    cropperOriginalSrc = imagesData[idx].src || getImageDisplaySource(imagesData[idx]) || '';
    cropperBaseSrc = cropperOriginalSrc;
    cropperSelectionMode = false;
    cropperPreviewActive = false;
    // Reset strokes para nueva imagen
    if (typeof markStrokes !== 'undefined') markStrokes = [];
    cropperImg = new window.Image();
    cropperImg.onload = function() {
        cropStart = null;
        cropEnd = null;
        cropperHasChanges = false;
        drawCropperImage();
        cropperModal.style.display = 'flex';
        document.body.classList.add('has-fullscreen-overlay');
        updateCropperActionButton();
    };
    cropperImg.src = cropperOriginalSrc;
}

// --- drawCropperImage ---
function drawCropperImage() {
    if (!cropperImg || !cropperImg.naturalWidth || !cropperImg.naturalHeight) return;
    const w = cropperImg.naturalWidth;
    const h = cropperImg.naturalHeight;
    cropperCanvas.width = w;
    cropperCanvas.height = h;
    cropperCtx.clearRect(0, 0, w, h);
    cropperCtx.drawImage(cropperImg, 0, 0, w, h);
    // Renderizar trazos pendientes (no horneados aún)
    if (typeof markStrokes !== 'undefined' && Array.isArray(markStrokes) && markStrokes.length > 0) {
        for (const stroke of markStrokes) {
            renderMarkStroke(cropperCtx, stroke);
        }
    }
    // Dibuja el rectángulo de recorte si está activo
    if (cropStart && cropEnd && cropperSelectionMode) {
        const rx = Math.min(cropStart.x, cropEnd.x);
        const ry = Math.min(cropStart.y, cropEnd.y);
        const rw = Math.abs(cropEnd.x - cropStart.x);
        const rh = Math.abs(cropEnd.y - cropStart.y);
        cropperCtx.save();
        cropperCtx.fillStyle = 'rgba(15, 23, 42, 0.34)';
        cropperCtx.fillRect(0, 0, w, h);
        cropperCtx.clearRect(rx, ry, rw, rh);
        cropperCtx.drawImage(cropperImg, rx, ry, rw, rh, rx, ry, rw, rh);
        cropperCtx.strokeStyle = '#2563eb';
        cropperCtx.lineWidth = 4;
        cropperCtx.setLineDash([10, 8]);
        cropperCtx.strokeRect(rx, ry, rw, rh);
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
    function getCanvasPointerPosition(event) {
        const rect = cropperCanvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    cropperCanvas.style.touchAction = 'none';

    cropperCanvas.addEventListener('pointerdown', function(e) {
        if (!cropperSelectionMode || e.pointerType === 'mouse' && e.button !== 0) return;
        updateScale();
        cropping = true;
        const position = getCanvasPointerPosition(e);
        cropStart = position;
        cropEnd = null;
        cropperCanvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    cropperCanvas.addEventListener('pointermove', function(e) {
        if (!cropperSelectionMode || !cropping || !cropStart) return;
        updateScale();
        const position = getCanvasPointerPosition(e);
        cropEnd = position;
        drawCropperImage();
        e.preventDefault();
    });

    cropperCanvas.addEventListener('pointerup', function(e) {
        if (!cropperSelectionMode || !cropping || !cropStart) return;
        updateScale();
        cropping = false;
        const position = getCanvasPointerPosition(e);
        cropEnd = position;
        drawCropperImage();
        if (cropStart && cropEnd) {
            const w = Math.abs(cropEnd.x - cropStart.x);
            const h = Math.abs(cropEnd.y - cropStart.y);
            if (w >= 10 && h >= 10) {
                cropperSelectionMode = true;
                cropperPreviewActive = false;
                drawCropperImage();
                updateCropperActionButton();
            }
        }
        cropperCanvas.releasePointerCapture(e.pointerId);
        e.preventDefault();
    });

    cropperCanvas.addEventListener('pointercancel', function(e) {
        cropping = false;
        cropperCanvas.releasePointerCapture(e.pointerId);
    });
}

async function confirmCropperChanges() {
    if (!cropperHasChanges || !imagesData[croppingIdx]) return;

    // Hornear trazos pendientes en la imagen final
    let finalSrc = cropperImg.src;
    if (typeof markStrokes !== 'undefined' && markStrokes.length > 0) {
        const baked = bakeMarkStrokes();
        if (baked) finalSrc = baked;
        markStrokes = [];
    }

    // Actualización optimista: cerrar modal y actualizar UI inmediatamente
    imagesData[croppingIdx].src = finalSrc;
    imagesData[croppingIdx].imageData = finalSrc;
    imagesData[croppingIdx].signedUrl = '';
    if (imagesData[croppingIdx]._localObjectUrl) {
        URL.revokeObjectURL(imagesData[croppingIdx]._localObjectUrl);
        imagesData[croppingIdx]._localObjectUrl = '';
    }
    const idx = croppingIdx;
    const imageId = imagesData[idx]._id;
    const isPending = imagesData[idx]._pendingUpload;
    const hasSession = !!currentSessionName;

    renderGrid();
    cropperModal.style.display = 'none';
    document.body.classList.remove('has-fullscreen-overlay');
    if (markMode) exitMarkMode(false);
    showToast('Cambios aplicados. Guardando...', 'success');

    if (hasSession) {
        markSessionDirty(true);
        return;
    }

    if (imageId && !isPending) {
        // API en background, sin loader
        try {
            const res = await apiFetch(`/image/${imageId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: imagesData[idx]?.description || '',
                    status: imagesData[idx]?.status || '',
                    imageData: finalSrc
                })
            });
            if (res.ok) {
                const updatedImage = await res.json();
                const remoteSource = getImageDisplaySource(updatedImage, '');
                if (imagesData[idx] && imagesData[idx]._id === imageId) {
                    imagesData[idx] = {
                        ...imagesData[idx],
                        ...updatedImage,
                        src: finalSrc,
                        imageData: finalSrc,
                        signedUrl: remoteSource || ''
                    };
                }
                fetchStorageUsage();
            } else {
                const errorText = await res.text();
                showToast(`No se pudo guardar el recorte: ${errorText}`, 'error');
            }
        } catch (error) {
            console.error('Error guardando recorte:', error);
            showToast('No se pudo guardar el recorte en la base de datos.', 'error');
        }
    } else {
        markSessionDirty(true);
    }
}

if (document.getElementById('cropperOkBtn')) {
    document.getElementById('cropperOkBtn').onclick = confirmCropperChanges;
}

const cropperCropBtn = document.getElementById('cropperCropBtn');
if (cropperCropBtn) {
    cropperCropBtn.onclick = function(event) {
        event.preventDefault();
        applyCropperSelection(false);
    };
}

const cropperRotateBtn = document.getElementById('cropperRotateBtn');
if (cropperRotateBtn) {
    cropperRotateBtn.onclick = applyCropperRotation;
}

// --- Botón cancelar/cerrar cropper ---
if (document.getElementById('cropperCancelBtn')) {
    document.getElementById('cropperCancelBtn').onclick = function() {
        cropperModal.style.display = 'none';
        document.body.classList.remove('has-fullscreen-overlay');
        if (markMode) exitMarkMode(false);
        if (typeof markStrokes !== 'undefined') markStrokes = [];
    };
}

// ============================================================
// HERRAMIENTA "MARCAR" — dibujar trazos/figuras sobre la imagen
// ============================================================
let markMode = false;
let markTool = 'pen';
let markColor = '#ef4444';
let markSize = 6;
let markStrokes = [];
let markCurrentStroke = null;
let markIsDrawing = false;

function enterMarkMode() {
    if (!cropperImg || !cropperImg.complete) return;
    markMode = true;
    // NOTA: markStrokes NO se resetea — persiste para que el usuario pueda
    // editar trazos previos al re-entrar al modo Marcar.
    const toolbar = document.getElementById('markToolbar');
    if (toolbar) toolbar.hidden = false;
    document.querySelectorAll('.cropper-btns .cropper-btn').forEach((b) => b.classList.add('is-mark-hidden'));
    cropperCanvas.classList.add('is-marking');
    drawCropperImage();
    cropperCanvas.addEventListener('pointerdown', onMarkPointerDown);
    cropperCanvas.addEventListener('pointermove', onMarkPointerMove);
    cropperCanvas.addEventListener('pointerup', onMarkPointerUp);
    cropperCanvas.addEventListener('pointerleave', onMarkPointerUp);
    cropperCanvas.addEventListener('pointercancel', onMarkPointerUp);
}

function exitMarkMode(applyChanges) {
    markMode = false;
    markIsDrawing = false;
    markCurrentStroke = null;
    markDraggingTextIndex = null;
    markDraggingStrokeIndex = null;
    markDragOriginPoints = null;
    hideMarkTextOverlay();
    const toolbar = document.getElementById('markToolbar');
    if (toolbar) toolbar.hidden = true;
    document.querySelectorAll('.cropper-btns .cropper-btn').forEach((b) => b.classList.remove('is-mark-hidden'));
    cropperCanvas.classList.remove('is-marking');
    cropperCanvas.removeEventListener('pointerdown', onMarkPointerDown);
    cropperCanvas.removeEventListener('pointermove', onMarkPointerMove);
    cropperCanvas.removeEventListener('pointerup', onMarkPointerUp);
    cropperCanvas.removeEventListener('pointerleave', onMarkPointerUp);
    cropperCanvas.removeEventListener('pointercancel', onMarkPointerUp);

    if (applyChanges && markStrokes.length > 0) {
        // NO horneamos los trazos en cropperImg — los dejamos como state
        // para que sean editables al re-entrar al modo Marcar.
        // Marcamos el cropper como cambiado para que se vea el botón Confirmar.
        cropperHasChanges = true;
        cropperPreviewActive = true;
        const okBtn = document.getElementById('cropperOkBtn');
        if (okBtn) {
            okBtn.style.display = '';
            okBtn.disabled = false;
        }
        updateCropperActionButton();
        drawCropperImage();
    } else if (!applyChanges) {
        // Cancelar: descartar trazos
        markStrokes = [];
        drawCropperImage();
    } else {
        drawCropperImage();
    }
}

function drawCropperImageWithMarks() {
    drawCropperImage();
}

function bakeMarkStrokes() {
    if (!markStrokes || markStrokes.length === 0) return null;
    if (!cropperImg || !cropperImg.naturalWidth) return null;
    const w = cropperImg.naturalWidth;
    const h = cropperImg.naturalHeight;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tctx = tempCanvas.getContext('2d');
    tctx.drawImage(cropperImg, 0, 0, w, h);
    for (const stroke of markStrokes) {
        renderMarkStroke(tctx, stroke);
    }
    return tempCanvas.toDataURL('image/png');
}

function renderMarkStroke(ctx, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'pen' && stroke.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    } else if (stroke.tool === 'line' && stroke.points.length >= 2) {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    } else if (stroke.tool === 'rect' && stroke.points.length >= 2) {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        ctx.beginPath();
        ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        ctx.stroke();
    } else if (stroke.tool === 'circle' && stroke.points.length >= 2) {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const rx = Math.abs(p2.x - p1.x) / 2;
        const ry = Math.abs(p2.y - p1.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
    } else if (stroke.tool === 'arrow' && stroke.points.length >= 2) {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const headLen = Math.max(12, stroke.size * 3.5);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x - Math.cos(angle) * stroke.size, p2.y - Math.sin(angle) * stroke.size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    } else if (stroke.tool === 'text' && stroke.text && stroke.points.length >= 1) {
        const fontSize = Math.max(18, stroke.size * 5);
        ctx.font = `bold ${fontSize}px "Inter", Arial, sans-serif`;
        ctx.textBaseline = 'top';
        // Borde negro para legibilidad
        ctx.lineWidth = Math.max(2, fontSize / 14);
        ctx.strokeStyle = stroke.color === '#000000' ? '#ffffff' : '#000000';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(stroke.text, stroke.points[0].x, stroke.points[0].y);
        // Relleno con el color
        ctx.fillStyle = stroke.color;
        ctx.fillText(stroke.text, stroke.points[0].x, stroke.points[0].y);
    }
    ctx.restore();
}

function getCropperCanvasCoords(event) {
    const rect = cropperCanvas.getBoundingClientRect();
    const scaleX = cropperCanvas.width / rect.width;
    const scaleY = cropperCanvas.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

let markDraggingTextIndex = null;
let markDragOffset = { x: 0, y: 0 };
let markDraggingStrokeIndex = null;
let markDragOriginPoints = null;
let markDragStart = { x: 0, y: 0 };

function getTextBounds(stroke) {
    if (!cropperCtx || !stroke || !stroke.text) return null;
    const fontSize = Math.max(18, stroke.size * 5);
    cropperCtx.font = `bold ${fontSize}px "Inter", Arial, sans-serif`;
    const metrics = cropperCtx.measureText(stroke.text);
    return {
        x: stroke.points[0].x,
        y: stroke.points[0].y,
        w: metrics.width + 8,
        h: fontSize * 1.25
    };
}

function findTextAtCoord(x, y) {
    for (let i = markStrokes.length - 1; i >= 0; i--) {
        const s = markStrokes[i];
        if (s.tool !== 'text') continue;
        const b = getTextBounds(s);
        if (!b) continue;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
            return i;
        }
    }
    return null;
}

function getStrokeBounds(stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return null;

    if (stroke.tool === 'text') {
        return getTextBounds(stroke);
    }

    // Calcular bounding box de todos los puntos
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of stroke.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
    }
    // Padding según grosor para que sea más fácil clickear líneas finas
    const pad = Math.max(8, (stroke.size || 6) * 1.5);
    return {
        x: minX - pad,
        y: minY - pad,
        w: (maxX - minX) + pad * 2,
        h: (maxY - minY) + pad * 2
    };
}

function findStrokeAtCoord(x, y) {
    for (let i = markStrokes.length - 1; i >= 0; i--) {
        const s = markStrokes[i];
        const b = getStrokeBounds(s);
        if (!b) continue;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
            return i;
        }
    }
    return null;
}

function showMarkTextOverlay(canvasX, canvasY, existingText = '') {
    const overlay = document.getElementById('markTextOverlay');
    const input = document.getElementById('markTextInput');
    if (!overlay || !input || !cropperCanvas) return;
    const rect = cropperCanvas.getBoundingClientRect();
    const stageRect = cropperCanvas.parentElement.getBoundingClientRect();
    const scaleX = rect.width / cropperCanvas.width;
    const scaleY = rect.height / cropperCanvas.height;
    const screenX = (rect.left - stageRect.left) + canvasX * scaleX;
    const screenY = (rect.top - stageRect.top) + canvasY * scaleY;
    overlay.style.left = `${Math.max(8, screenX)}px`;
    overlay.style.top = `${Math.max(8, screenY)}px`;
    overlay.dataset.canvasX = String(canvasX);
    overlay.dataset.canvasY = String(canvasY);
    overlay.hidden = false;
    input.value = existingText;
    setTimeout(() => input.focus(), 30);
}

function hideMarkTextOverlay() {
    const overlay = document.getElementById('markTextOverlay');
    if (overlay) {
        overlay.hidden = true;
        overlay.dataset.canvasX = '';
        overlay.dataset.canvasY = '';
    }
}

function confirmMarkTextOverlay() {
    const overlay = document.getElementById('markTextOverlay');
    const input = document.getElementById('markTextInput');
    if (!overlay || !input || overlay.hidden) return;
    const text = (input.value || '').trim();
    if (!text) {
        hideMarkTextOverlay();
        return;
    }
    const canvasX = Number(overlay.dataset.canvasX);
    const canvasY = Number(overlay.dataset.canvasY);
    if (Number.isFinite(canvasX) && Number.isFinite(canvasY)) {
        markStrokes.push({
            tool: 'text',
            color: markColor,
            size: markSize,
            points: [{ x: canvasX, y: canvasY }],
            text: text
        });
        drawCropperImage();
    }
    hideMarkTextOverlay();
}

function onMarkPointerDown(event) {
    if (!markMode) return;
    event.preventDefault();

    const pt = getCropperCanvasCoords(event);

    if (markTool === 'select') {
        const hitIdx = findStrokeAtCoord(pt.x, pt.y);
        if (hitIdx !== null) {
            markDraggingStrokeIndex = hitIdx;
            markDragStart = { x: pt.x, y: pt.y };
            // Guardar copia de las posiciones originales
            markDragOriginPoints = markStrokes[hitIdx].points.map((p) => ({ x: p.x, y: p.y }));
            cropperCanvas.setPointerCapture?.(event.pointerId);
            cropperCanvas.classList.add('is-dragging-text');
        }
        return;
    }

    if (markTool === 'text') {
        // ¿Click sobre un texto existente?
        const hitIdx = findTextAtCoord(pt.x, pt.y);
        if (hitIdx !== null) {
            // Empezar a arrastrar el texto
            markDraggingTextIndex = hitIdx;
            const stroke = markStrokes[hitIdx];
            markDragOffset = {
                x: pt.x - stroke.points[0].x,
                y: pt.y - stroke.points[0].y
            };
            cropperCanvas.setPointerCapture?.(event.pointerId);
            cropperCanvas.classList.add('is-dragging-text');
            return;
        }
        // Si no hay texto en la posición, crear uno nuevo con overlay
        showMarkTextOverlay(pt.x, pt.y);
        return;
    }

    cropperCanvas.setPointerCapture?.(event.pointerId);
    markIsDrawing = true;
    markCurrentStroke = {
        tool: markTool,
        color: markColor,
        size: markSize,
        points: [pt]
    };
    if (markTool !== 'pen') markCurrentStroke.points.push({ ...pt });
    markStrokes.push(markCurrentStroke);
    drawCropperImage();
}

function onMarkPointerMove(event) {
    if (!markMode) return;

    // Arrastrando un trazo cualquiera con el cursor select
    if (markDraggingStrokeIndex !== null && markDragOriginPoints) {
        event.preventDefault();
        const pt = getCropperCanvasCoords(event);
        const dx = pt.x - markDragStart.x;
        const dy = pt.y - markDragStart.y;
        const stroke = markStrokes[markDraggingStrokeIndex];
        if (stroke) {
            stroke.points = markDragOriginPoints.map((p) => ({
                x: p.x + dx,
                y: p.y + dy
            }));
            drawCropperImage();
        }
        return;
    }

    // Arrastrando texto (compat: cuando se usa la herramienta text)
    if (markDraggingTextIndex !== null) {
        event.preventDefault();
        const pt = getCropperCanvasCoords(event);
        const stroke = markStrokes[markDraggingTextIndex];
        if (stroke && stroke.tool === 'text') {
            stroke.points[0] = {
                x: pt.x - markDragOffset.x,
                y: pt.y - markDragOffset.y
            };
            drawCropperImage();
        }
        return;
    }

    if (!markIsDrawing || !markCurrentStroke) return;
    event.preventDefault();
    const pt = getCropperCanvasCoords(event);
    if (markCurrentStroke.tool === 'pen') {
        markCurrentStroke.points.push(pt);
    } else {
        markCurrentStroke.points[markCurrentStroke.points.length - 1] = pt;
    }
    drawCropperImage();
}

function onMarkPointerUp(event) {
    if (!markMode) return;

    if (markDraggingStrokeIndex !== null) {
        markDraggingStrokeIndex = null;
        markDragOriginPoints = null;
        cropperCanvas.classList.remove('is-dragging-text');
        return;
    }

    if (markDraggingTextIndex !== null) {
        markDraggingTextIndex = null;
        cropperCanvas.classList.remove('is-dragging-text');
        return;
    }

    if (!markIsDrawing) return;
    markIsDrawing = false;
    if (markCurrentStroke && markCurrentStroke.tool === 'pen' && markCurrentStroke.points.length < 2) {
        markStrokes.pop();
    }
    markCurrentStroke = null;
    drawCropperImage();
}

// Event handlers para el overlay de texto
document.getElementById('markTextOverlayConfirm')?.addEventListener('click', confirmMarkTextOverlay);
document.getElementById('markTextOverlayCancel')?.addEventListener('click', hideMarkTextOverlay);
document.getElementById('markTextInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        confirmMarkTextOverlay();
    } else if (event.key === 'Escape') {
        event.preventDefault();
        hideMarkTextOverlay();
    }
});

document.getElementById('cropperMarkBtn')?.addEventListener('click', enterMarkMode);
document.getElementById('markExitBtn')?.addEventListener('click', () => exitMarkMode(false));
document.getElementById('markDoneBtn')?.addEventListener('click', () => exitMarkMode(true));
document.getElementById('markUndoBtn')?.addEventListener('click', () => {
    markStrokes.pop();
    drawCropperImage();
});
document.getElementById('markClearBtn')?.addEventListener('click', () => {
    markStrokes = [];
    drawCropperImage();
});
document.querySelectorAll('[data-mark-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-mark-tool]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        markTool = btn.getAttribute('data-mark-tool');
        if (cropperCanvas) {
            cropperCanvas.classList.toggle('is-select-mode', markTool === 'select');
        }
        hideMarkTextOverlay();
    });
});
document.querySelectorAll('[data-mark-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-mark-color]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        markColor = btn.getAttribute('data-mark-color');
    });
});
const markSizeSlider = document.getElementById('markSizeSlider');
const markSizeValue = document.getElementById('markSizeValue');
if (markSizeSlider) {
    markSizeSlider.addEventListener('input', (e) => {
        markSize = Number(e.target.value);
        if (markSizeValue) markSizeValue.textContent = String(markSize);
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
    if (!currentSessionName) {
        await waitForLooseUploadsToFinish();
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
        const res = await apiFetch(`/session/${encodeURIComponent(name)}?includeImageData=true`);
        if (!res.ok) {
            if (!options.silent) {
                showToast('No se pudo cargar la sesión.', 'error');
            }
            return;
        }

        const session = await res.json();
        const restoredDraft = options.forceServer ? false : restoreSessionDraftIntoState(name);
        if (!restoredDraft) {
            imagesData = session.images.map(img => ({ ...img, src: img.imageData || getImageDisplaySource(img), _scope: 'session' }));
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

        // OPTIMIZACIÓN: Refresh completo UI + storage
        imagesData = [];
        imageCount = 0;
        if (currentSessionName) {
            await loadSessionFromDB({ sessionName: currentSessionName, silent: true });
        } else {
            await loadSession();
        }
        renderGrid();
        updateImageCounter();
        fetchStorageUsage();
        showToast(deletingSessionImages ? '✅ Imágenes eliminadas de la sesión.' : '✅ Espacio Sin sesión limpiado.', 'success');
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

window.quickStateSelectAll = async function(state) {
  if (!state || imagesData.length === 0) return;
  // Optimistic UI
  if (currentSessionName) pushUndoState('Estado rápido todas');
  imagesData.forEach((img, i) => { if (img) img.status = state; });
  renderGrid();
  updateImageCounter();
  // Background sync
  const promises = imagesData.filter(img => img?._id).map(img => 
    apiFetch(`/image/${img._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: img.description || '', status: state })
    }).catch(console.warn)
  );
  const results = await Promise.allSettled(promises);
  const success = results.filter(r => r.status === 'fulfilled').length;
  showToast(`⚡ "${getQuickStateVisual(state).label}" → ${success}/${promises.length}`, 'success');
};

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
document.getElementById('quickStateSelectAll').onclick = () => quickStateSelectAll(window.quickStateSelected);


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
            if (e.target.closest('.remove-image-btn') || e.target.closest('.description') || e.target.closest('.status-select') || e.target.closest('.status-select-ui')) {
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
