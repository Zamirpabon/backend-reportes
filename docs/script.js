const input = document.getElementById('imageInput');
const grid = document.getElementById('gridContainer');
const generateBtn = document.getElementById('generateBtn');
const loadingText = document.getElementById('loadingText');
const progressFill = document.getElementById('progressFill');
let imageCount = 0;
let imagesData = [];

// Agregar input para número inicial de imagen
let imageStartNumber = 1;

input.addEventListener('change', handleImageUpload);

window.addEventListener('DOMContentLoaded', () => {
    loadSession();
    updateImageCounter();
    addSessionControls(); // <-- Ensure session controls are initialized
    setupSessionDropdownMenu();
});

// --- NUEVO: Configuración para usar backend Node.js + MongoDB ---
// Cambia la URL base según tu despliegue en local o en la nube
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : 'https://backend-reportes-lzfl.onrender.com'; // <-- URL pública de Render.com

// --- Reemplazar localStorage por backend ---
async function saveSession() {
    // Guardar todas las imágenes (actualizar descripción/estado)
    for (let img of imagesData) {
        if (img._id) {
            await fetch(`${API_BASE_URL}/image/${img._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: img.description, status: img.status })
            });
        }
    }
}

async function loadSession() {
    const res = await fetch(`${API_BASE_URL}/images`);
    const data = await res.json();
    // Asignar imageData como src para cada imagen
    imagesData = data.map(img => ({ ...img, src: img.imageData }));
    imageCount = imagesData.length;
    imageStartNumber = 1;
    renderGrid();
    if (imagesData.length > 0) generateBtn.disabled = false;
}

// --- Subir imágenes al backend ---
async function handleImageUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    loadingText.style.display = 'block';
    progressFill.style.width = '0%';
    let newImages = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Leer archivo como base64
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        // Enviar al backend como JSON
        const res = await fetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData: base64, description: '', status: '' })
        });
        const img = await res.json();
        img.src = img.imageData;
        newImages.push(img);
        progressFill.style.width = `${((i + 1) / files.length) * 100}%`;
    }
    await loadSession(); // <-- Recargar desde backend
    renderGrid();
    loadingText.style.display = 'none';
    generateBtn.disabled = imagesData.length === 0;
    await saveSession(); // <-- Asegura que la sesión seleccionada se actualiza
    updateImageCounter();
}

// --- Eliminar imagen en backend ---
window.removeImage = async function(idx, event) {
    event.stopPropagation();
    const img = imagesData[idx];
    if (img._id) {
        await fetch(`${API_BASE_URL}/image/${img._id}`, { method: 'DELETE' });
    }
    // imagesData.splice(idx, 1);
    await loadSession(); // <-- Recargar desde backend
    renderGrid();
    if (imagesData.length === 0) {
        generateBtn.disabled = true;
    }
    updateImageCounter();
    saveSession();
};

// --- Actualizar descripción/estado en backend ---
window.updateImageData = async function(idx, field, value) {
    if (!imagesData[idx]) return;
    imagesData[idx][field] = value;
    if (imagesData[idx]._id) {
        await fetch(`${API_BASE_URL}/image/${imagesData[idx]._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: imagesData[idx].description, status: imagesData[idx].status })
        });
    }
    updateImageCounter();
    saveSession();
};

// --- Al cargar la página, cargar imágenes desde backend ---
window.addEventListener('DOMContentLoaded', () => {
    loadSession();
});

// --- Contador y límite de imágenes ---
// Eliminar MAX_IMAGES y mostrar solo la cantidad de imágenes subidas
function updateImageCounter() {
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
      `<span style='margin-right:18px;display:inline-flex;align-items:center;gap:6px;'>
        <b>Num. inicial:</b>
        <input type='number' id='imageStartNumberInput' min='1' value='${imageStartNumber}' style='width:60px;font-size:1.08rem;font-weight:bold;border-radius:8px;border:2px solid #3498db;padding:2px 8px;color:#2c3e50;text-align:center;'/>
      </span>` +
      `<span id="stateCounter" style="margin-right:18px;">
        <span style="font-weight:bold;color:#2c3e50;">Estados seleccionados:</span> <span id="stateCountValue"></span> / ${total}
      </span>` +
      `<span id="descCounter" style="margin-right:18px;">
        <span style="font-weight:bold;color:#2c3e50;">Descripciones llenas:</span> <span id="descCountValue"></span> / ${total}
      </span>` +
      `Imágenes subidas: ${total}`;
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
            saveSession();
        };
    }
    let descFilled = imagesData.filter(img => (img.description && img.description.trim().length > 0)).length;
    let stateFilled = imagesData.filter(img => (img.status && img.status !== "")).length;
    let descCountValue = document.getElementById('descCountValue');
    let stateCountValue = document.getElementById('stateCountValue');
    if (descCountValue) descCountValue.textContent = descFilled;
    if (stateCountValue) stateCountValue.textContent = stateFilled;
    // Alternar clase en body para mostrar/ocultar el botón y altura card
    if (typeof document !== 'undefined') {
        if (total > 0) {
            document.body.classList.add('has-images');
        } else {
            document.body.classList.remove('has-images');
        }
    }
}

// --- Integrar límite en handleImageUpload ---
// Eliminar validación de límite de imágenes
const originalHandleImageUpload = handleImageUpload;
handleImageUpload = async function(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    await originalHandleImageUpload.call(this, event);
    saveSession();
    updateImageCounter();
};

async function handleImageUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    loadingText.style.display = 'block';
    progressFill.style.width = '0%';
    // Procesar todas las imágenes primero y luego actualizar el grid una sola vez
    let startIndex = imagesData.length;
    let newImages = [];
    for (let i = 0; i < files.length; i++) {
        try {
            const imageData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    resizeImage(e.target.result, 1024, (resizedDataUrl) => {
                        resolve({
                            src: resizedDataUrl,
                            index: imagesData.length + newImages.length + 1,
                            description: '',
                            status: ''
                        });
                    });
                };
                reader.onerror = () => reject(new Error('Error leyendo la imagen.'));
                reader.readAsDataURL(files[i]);
            });
            newImages.push(imageData);
        } catch (err) {
            // Si una imagen falla, continuar con las demás
            console.error('Error procesando imagen:', err);
        }
        progressFill.style.width = `${((i + 1) / files.length) * 100}%`;
    }
    // Agregar todas las nuevas imágenes de golpe
    imagesData.push(...newImages);
    renderGrid();
    loadingText.style.display = 'none';
    generateBtn.disabled = imagesData.length === 0;
}

function processImage(file, index) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            // Redimensionar la imagen antes de guardarla (máx 1024px)
            resizeImage(e.target.result, 1024, (resizedDataUrl) => {
                imageCount++;
                const imageData = {
                    src: resizedDataUrl,
                    index: imagesData.length + 1, // index secuencial
                    description: '',
                    status: ''
                };
                imagesData.push(imageData);
                renderGrid();
                resolve();
            });
        };
        reader.readAsDataURL(file);
    });
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
    imagesData.forEach((imageData, idx) => {
        imageData.index = imageStartNumber + idx;
        createImageBox(imageData, idx);
    });
    updateImageCounter(); // <-- Siempre actualiza el contador tras renderizar
    saveSession(); // <-- Guarda la sesión tras cualquier cambio visual
    // --- NUEVO: Si está en modo selección rápida, re-aplicar handlers ---
    if (window.quickStateMode) {
        applyQuickStateHandlers();
    }
}

function createImageBox(imageData, idx) {
    const div = document.createElement('div');
    div.className = 'image-box';
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
                const reader = new FileReader();
                reader.onload = (ev) => {
                    resizeImage(ev.target.result, 1024, (resizedDataUrl) => {
                        imagesData[idx].src = resizedDataUrl;
                        renderGrid();
                        updateImageCounter();
                        saveSession();
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
    div.innerHTML = `
    <button class="remove-image-btn" title="Eliminar imagen" onclick="removeImage(${idx}, event)">×</button>
    <div class="image-container" style="position:relative;">
        <img src="${imageData.src}" alt="Imagen ${imageData.index}" style="cursor:crosshair;" class="img-cropper-trigger" data-idx="${idx}" />
    </div>
    <div class="image-label-desc-row">
        <div class="image-label">Imagen ${imageData.index}:</div>
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
    div.querySelector('.img-cropper-trigger').onclick = function(e) {
        if (!window.quickStateMode) showImageCropper(idx);
        e.stopPropagation();
    };
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

// --- Guardar sesión y estado en el backend al cerrar ---
window.addEventListener('beforeunload', async () => {
    // Guardar estado de imágenes (descripción y estado) al cerrar o recargar
    for (let img of imagesData) {
        if (img._id) {
            await fetch(`${API_BASE_URL}/image/${img._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: img.description, status: img.status })
            });
        }
    }
});

window.removeImage = function(idx, event) {
    event.stopPropagation();
    imagesData.splice(idx, 1);
    renderGrid();
    if (imagesData.length === 0) {
        generateBtn.disabled = true;
    }
}

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
            alert('Error: No se puede cargar la librería docx. Verifica tu conexión a internet y recarga la página.');
            return;
        }
    }

    if (imagesData.length === 0) {
        alert('Por favor, carga al menos una imagen antes de generar el reporte.');
        return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ Generando...';

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
                            const imageBuffer = base64ToArrayBuffer(imageData.src);
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
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_fotografico_inspeccion_${new Date().toISOString().split('T')[0]}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showSuccessAlert('¡Reporte generado exitosamente con formato 3x3!');

    } catch (error) {
        console.error('Error al generar el documento:', error);
        alert('Error al generar el documento: ' + error.message);
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = '📄 Generar Reporte Word';
    }
}

// Alerta moderna de éxito
function showSuccessAlert(message) {
    const old = document.getElementById('successAlertModal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'successAlertModal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(39, 174, 96, 0.12)';
    modal.style.zIndex = '100001';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = `
      <div style="background:linear-gradient(135deg,#27ae60 60%,#2ecc71 100%);max-width:400px;width:90vw;padding:32px 24px 24px 24px;border-radius:18px;box-shadow:0 8px 32px #0003;display:flex;flex-direction:column;align-items:center;position:relative;animation:fadeInScale 0.4s;">
        <div style="font-size:2.5rem;color:#fff;margin-bottom:10px;">✅</div>
        <div style="font-size:1.18rem;color:#fff;text-align:center;margin-bottom:18px;font-weight:bold;">${message}</div>
        <button id="successAlertBtn" class="generate-btn" style="background:#fff;color:#27ae60;min-width:120px;font-weight:bold;font-size:1rem;box-shadow:0 2px 8px #27ae6033;">Cerrar</button>
      </div>
      <style>@keyframes fadeInScale{0%{opacity:0;transform:scale(0.8);}100%{opacity:1;transform:scale(1);}}</style>
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
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(44,62,80,0.18)';
    modal.style.zIndex = '100002';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = `
      <div style="background:#fff;max-width:420px;width:92vw;padding:36px 28px 28px 28px;border-radius:20px;box-shadow:0 8px 32px #0002;display:flex;flex-direction:column;align-items:center;position:relative;animation:fadeInScale 0.4s;">
        <div style="font-size:2.5rem;color:#e67e22;margin-bottom:12px;">📝</div>
        <div style="font-size:1.18rem;color:#222;text-align:center;margin-bottom:18px;font-weight:bold;">Faltan datos en algunas imágenes</div>
        <div style="font-size:1rem;color:#444;text-align:center;margin-bottom:18px;">${message}</div>
        <div style="display:flex;gap:14px;justify-content:center;width:100%;margin-top:8px;">
          <button id="fancyAlertBtnContinue" class="generate-btn" style="background:#27ae60;min-width:120px;">Continuar</button>
          <button id="fancyAlertBtn" class="generate-btn" style="background:#e74c3c;min-width:120px;">Editar</button>
        </div>
      </div>
      <style>@keyframes fadeInScale{0%{opacity:0;transform:scale(0.8);}100%{opacity:1;transform:scale(1);}}</style>
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

// --- Guardar sesión and contador al renderizar y eliminar imágenes ---
const originalRenderGrid = renderGrid;
renderGrid = function() {
    originalRenderGrid.apply(this, arguments);
    updateImageCounter();
    saveSession();
};

const originalRemoveImage = window.removeImage;
window.removeImage = function(idx, event) {
    originalRemoveImage(idx, event);
    updateImageCounter();
    saveSession();
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
    if (!name) return alert('Escribe un nombre para la sesión');
    syncDescriptionsFromDOM();
    const images = imagesData.map(({ imageData, src, description, status, createdAt }) => ({
        imageData: imageData || src,
        description,
        status,
        createdAt: createdAt || new Date()
    }));
    await fetch(`${API_BASE_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, images })
    });
    await loadSessionList();
    alert('Sesión guardada');
}

async function loadSessionList() {
    const res = await fetch(`${API_BASE_URL}/sessions`);
    const sessions = await res.json();
    const select = document.getElementById('sessionList');
    select.innerHTML = '';
    // Siempre agrega la opción por defecto al inicio
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Seleccionar sesión';
    defaultOpt.selected = true;
    defaultOpt.disabled = true;
    select.appendChild(defaultOpt);
    sessions.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = `${s.name} (${new Date(s.createdAt).toLocaleString()})`;
        select.appendChild(opt);
    });
    // Si no hay sesión seleccionada, deja la opción por defecto
    select.value = '';
}

async function loadSessionFromDB() {
    const select = document.getElementById('sessionList');
    const name = select.value;
    if (!name) return alert('Selecciona una sesión');
    const res = await fetch(`${API_BASE_URL}/session/${name}`);
    if (!res.ok) return alert('No se pudo cargar la sesión');
    const session = await res.json();
    imagesData = session.images.map(img => ({ ...img, src: img.imageData }));
    imageCount = imagesData.length;
    imageStartNumber = 1;
    renderGrid();
    updateImageCounter();
    alert('Sesión cargada');
}

async function deleteSessionFromDB() {
    const select = document.getElementById('sessionList');
    const name = select.value;
    if (!name) return alert('Selecciona una sesión');
    if (!confirm('¿Seguro que quieres borrar esta sesión?')) return;
    await fetch(`${API_BASE_URL}/session/${name}`, { method: 'DELETE' });
    await loadSessionList();
    alert('Sesión borrada');
}

async function clearAllSessions() {
    if (!confirm('¿Seguro que quieres borrar TODAS las sesiones?')) return;
    await fetch(`${API_BASE_URL}/sessions`, { method: 'DELETE' });
    await loadSessionList();
    alert('Todas las sesiones han sido borradas');
}

function removeOldSessionControls() {
    const old = document.getElementById('sessionControls');
    if (old) old.remove();
}

function addSessionControls() {
    removeOldSessionControls();
    document.getElementById('saveSessionBtn').onclick = saveSessionToDB;
    document.getElementById('loadSessionBtn').onclick = loadSessionFromDB;
    document.getElementById('deleteSessionBtn').onclick = deleteSessionFromDB;
    document.getElementById('btn-clear-db').onclick = clearAllSessions;
    loadSessionList();
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
    clearBtn.onclick = async function() {
        for (let img of imagesData) {
            if (img._id) {
                await fetch(`${API_BASE_URL}/image/${img._id}`, { method: 'DELETE' });
            }
        }
        imagesData = [];
        imageStartNumber = 1;
        await loadSession();
        renderGrid();
        updateImageCounter();
        generateBtn.disabled = true;
        if (progressFill) progressFill.style.width = '0%';
        if (loadingText) loadingText.style.display = 'none';
    };
}

// --- Lógica para selección rápida de estado ---
window.quickStateMode = false;

// --- Modern Quick State Banner ---
function showQuickStateBanner() {
    // Eliminar banners previos
    let oldBanner = document.getElementById('quickStateBanner');
    if (oldBanner) oldBanner.remove();
    let oldOverlay = document.getElementById('quickStateOverlay');
    if (oldOverlay) oldOverlay.remove();

    // Overlay: permite interacción con imágenes (pointer-events: none fuera del banner)
    const overlay = document.createElement('div');
    overlay.id = 'quickStateOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(44,62,80,0.18)';
    overlay.style.zIndex = '10010';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'flex-start';
    overlay.style.justifyContent = 'center';
    document.body.appendChild(overlay);

    // Banner: contiene los botones de selección rápida
    const banner = document.createElement('div');
    banner.id = 'quickStateBanner';
    banner.style.position = 'relative';
    banner.style.marginTop = '60px';
    banner.style.background = '#fff'; // Fondo blanco sólido
    banner.style.color = '#222';
    banner.style.fontWeight = 'bold';
    banner.style.fontSize = '1.18rem';
    banner.style.padding = '28px 38px 22px 38px';
    banner.style.borderRadius = '22px';
    banner.style.boxShadow = '0 8px 32px #0002';
    banner.style.zIndex = '10011';
    banner.style.display = 'flex';
    banner.style.flexDirection = 'column';
    banner.style.alignItems = 'center';
    banner.style.animation = 'slideDownQuickState 0.35s cubic-bezier(.7,1.6,.5,1)';
    banner.style.pointerEvents = 'auto'; // El banner sí recibe eventos
    banner.innerHTML = `
      <button id="quickStateCloseBtn" style="position:absolute;top:14px;right:18px;background:none;border:none;font-size:1.7rem;color:#888;cursor:pointer;z-index:2;transition:color 0.2s;" title="Salir">×</button>
      <div style="font-size:1.15rem;font-weight:bold;margin-bottom:18px;letter-spacing:0.5px;display:flex;align-items:center;gap:10px;">
        <span style="color:#2980b9;font-size:1.5rem;">⚡</span> Selección rápida de estado
      </div>
      <div style="display:flex;gap:22px;margin-bottom:18px;">
        <button class="quick-state-btn" id="quickStateVerde" title="Buen estado" style="background:#27ae60;"><span>🟢</span></button>
        <button class="quick-state-btn" id="quickStateAmarillo" title="Observación" style="background:#f1c40f;color:#222;"><span>🟡</span></button>
        <button class="quick-state-btn" id="quickStateRojo" title="No conformidad" style="background:#e74c3c;"><span>🔴</span></button>
        <button class="quick-state-btn" id="quickStateClear" title="Limpiar estado" style="background:#bdc3c7;color:#222;"><span>❌</span></button>
      </div>
      <div style="display:flex;gap:18px;align-items:center;">
        <button id="quickStateSelectAll" class="generate-btn" style="background:#2980b9;color:#fff;font-size:1.05rem;padding:8px 22px;border-radius:12px;">Seleccionar todo</button>
      </div>
    `;
    // El banner debe estar por encima y sí recibir eventos
    banner.onclick = function(e) { e.stopPropagation(); };
    overlay.appendChild(banner);

    // Inyectar CSS solo una vez
    if (!document.getElementById('quickStateBannerCSS')) {
        const css = document.createElement('style');
        css.id = 'quickStateBannerCSS';
        css.innerHTML = `
        @keyframes slideDownQuickState {0%{opacity:0;transform:translateY(-40px);}100%{opacity:1;transform:translateY(0);}}
        .quick-state-btn {
          width: 64px; height: 64px; border-radius: 50%; border: none; font-size: 2.1rem;
          display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 12px #0001;
          cursor: pointer; transition: box-shadow 0.2s, transform 0.2s, outline 0.2s;
          outline: 3px solid transparent; font-weight: bold;
        }
        .quick-state-btn.selected, .quick-state-btn:focus {
          outline: 3px solid #222;
          box-shadow: 0 4px 18px #0002;
          transform: scale(1.08);
        }
        .quick-state-btn:hover {
          box-shadow: 0 6px 24px #0002;
          transform: scale(1.10);
        }
        #quickStateCloseBtn:hover { color: #e74c3c; }
        `;
        document.head.appendChild(css);
    }

    // Estado seleccionado para aplicar con "Seleccionar todo" o clic en imágenes
    window.quickStateSelected = null;
    function highlightBtn(state) {
        ['Verde','Amarillo','Rojo','Clear'].forEach(s => {
            let btn = document.getElementById('quickState'+s);
            if (btn) btn.classList.toggle('selected', state === s.toLowerCase());
        });
    }
    document.getElementById('quickStateVerde').onclick = function(e) {
        window.quickStateSelected = 'verde';
        highlightBtn('verde');
    };
    document.getElementById('quickStateAmarillo').onclick = function(e) {
        window.quickStateSelected = 'amarillo';
        highlightBtn('amarillo');
    };
    document.getElementById('quickStateRojo').onclick = function(e) {
        window.quickStateSelected = 'rojo';
        highlightBtn('rojo');
    };
    document.getElementById('quickStateClear').onclick = function(e) {
        window.quickStateSelected = '';
        highlightBtn('clear');
    };
    document.getElementById('quickStateSelectAll').onclick = function(e) {
        if (window.quickStateSelected === null) return;
        imagesData.forEach(img => img.status = window.quickStateSelected);
        updateImageCounter();
        saveSession();
        renderGrid();
    };
    // Solo la X cierra el banner
    document.getElementById('quickStateCloseBtn').onclick = function(e) {
        e.stopPropagation();
        exitQuickStateMode(e);
    };

    // Permitir cerrar haciendo click fuera del banner
    overlay.addEventListener('mousedown', function(e) {
        if (e.target === overlay) exitQuickStateMode(e);
    });
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
    applyQuickStateHandlers();
    setTimeout(showQuickStateBanner, 10);
}

function exitQuickStateMode(e) {
    if (e && e.target && e.target.closest && e.target.closest('#quickStateBanner')) return;
    window.quickStateMode = false;
    document.body.classList.remove('quick-state-mode');
    document.querySelectorAll('.image-box').forEach((box, idx) => {
        box.classList.remove('quick-select');
        const img = box.querySelector('.img-cropper-trigger');
        if (img) img.onclick = function(e) { showImageCropper(idx); e.stopPropagation(); };
    });
    document.body.onclick = null;
    hideQuickStateBanner();
}

function applyQuickStateHandlers() {
    document.querySelectorAll('.image-box').forEach((box, idx) => {
        box.classList.add('quick-select');
        // Eliminar cualquier handler previo
        box.onclick = null;
        const img = box.querySelector('.img-cropper-trigger');
        if (img) {
            img.onclick = function(e) {
                e.stopPropagation();
                if (window.quickStateSelected === null) return;
                // Actualizar estado en datos
                imagesData[idx].status = window.quickStateSelected;
                // Actualizar borde visualmente
                if (window.quickStateSelected === 'verde') {
                    box.style.border = '3px solid #27ae60';
                } else if (window.quickStateSelected === 'amarillo') {
                    box.style.border = '3px solid #f1c40f';
                } else if (window.quickStateSelected === 'rojo') {
                    box.style.border = '3px solid #e74c3c';
                } else {
                    box.style.border = '2px solid #ecf0f1';
                }
                updateImageCounter();
                saveSession();
            };
        }
        // Visual feedback inicial
        if (imagesData[idx].status === 'verde') {
            box.style.border = '3px solid #27ae60';
        } else if (imagesData[idx].status === 'amarillo') {
            box.style.border = '3px solid #f1c40f';
        } else if (imagesData[idx].status === 'rojo') {
            box.style.border = '3px solid #e74c3c';
        } else {
            box.style.border = '2px solid #ecf0f1';
        }
    });
    // No cerrar modo rápido al hacer click fuera
    document.body.onclick = null;
}

// --- Integración de menú ⋮ con backend ---
function setupSessionDropdownMenu() {
    var btn = document.getElementById('optionsMenuBtn');
    var dd = document.getElementById('optionsDropdown');
    if (!btn || !dd) return;
    // Asignar acciones correctas a los ítems del menú
    var borrarSesion = dd.querySelector('.dropdown-item.btn-delete:nth-child(1)');
    var borrarDB = dd.querySelector('.dropdown-item.btn-delete:nth-child(2)');
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

document.addEventListener('DOMContentLoaded', function() {
    loadSession();
    updateImageCounter();
    addSessionControls();
    setupSessionDropdownMenu();
});

// --- Fin de script ---
window.saveChangesToCurrentSession = async function() {
    const select = document.getElementById('sessionList');
    const name = select && select.value ? select.value.trim() : null;
    // Si hay imágenes nuevas y una sesión seleccionada, advertir antes de guardar
    if (name && imagesData.length > 0 && input && input.files && input.files.length > 0) {
        if (!confirm('Tienes imágenes nuevas cargadas y una sesión seleccionada. ¿Seguro que quieres guardar los cambios en esta sesión?')) {
            return;
        }
    }
    if (!name) {
        alert('Selecciona una sesión para guardar los cambios.');
        return;
    }
    syncDescriptionsFromDOM && syncDescriptionsFromDOM();
    const images = imagesData.map(({ imageData, src, description, status, createdAt }) => ({
        imageData: imageData || src,
        description,
        status,
        createdAt: createdAt || new Date()
    }));
    try {
        await fetch(`${API_BASE_URL}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, images })
        });
        alert('¡Cambios guardados en la sesión "' + name + '"!');
        await loadSessionList && loadSessionList();
    } catch (e) {
        alert('Error al guardar los cambios en la sesión.');
    }
};
