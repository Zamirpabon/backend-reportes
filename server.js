require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'report-images';
const LOOSE_IMAGE_RETENTION_HOURS = 72;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES || 8 * 1024 * 1024);
const STORAGE_LIMIT_BYTES = Number(process.env.SUPABASE_STORAGE_LIMIT_BYTES || 1024 * 1024 * 1024);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
]);
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Clave para proteger el endpoint de mantenimiento
const MAINTENANCE_KEY = process.env.MAINTENANCE_KEY || 'maintenance-key-change-me';

const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`Faltan variables de entorno: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'docs')));

function logInfo(message, extra = {}) {
  console.log(`[backend-reportes] ${message}`, Object.keys(extra).length ? extra : '');
}

function logWarn(message, extra = {}) {
  console.warn(`[backend-reportes] ${message}`, Object.keys(extra).length ? extra : '');
}

function logError(message, error, extra = {}) {
  console.error(`[backend-reportes] ${message}`, {
    ...extra,
    error: error?.message || error
  });
}

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logInfo(`${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });
  next();
});

function asyncHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      logError(`Unhandled error in ${req.method} ${req.originalUrl}`, error);
      res.status(500).json({ error: error.message || 'Error interno del servidor' });
    }
  };
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function validateSessionName(name) {
  const normalized = normalizeText(name);

  if (!normalized) {
    throw new Error('El nombre de la sesión es obligatorio.');
  }

  if (normalized.length > 120) {
    throw new Error('El nombre de la sesión no puede superar 120 caracteres.');
  }

  return normalized;
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/s.exec(dataUrl || '');

  if (!match) {
    throw new Error('Formato de imagen no valido. Se esperaba un data URL en base64.');
  }

  const mimeType = match[1];

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
  }

  const buffer = Buffer.from(match[2], 'base64');

  if (!buffer.length) {
    throw new Error('La imagen está vacía.');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`La imagen supera el máximo permitido de ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`);
  }

  return {
    mimeType,
    buffer
  };
}

function getFileExtension(mimeType) {
  const extensionMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif'
  };

  return extensionMap[mimeType] || 'bin';
}

async function uploadDataUrl(dataUrl, folder) {
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const extension = getFileExtension(mimeType);
  const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false
    });

  if (error) {
    throw new Error(`No se pudo subir la imagen a Storage: ${error.message}`);
  }

  return { storagePath, mimeType };
}

async function storageFileToDataUrl(storagePath, mimeType) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);

  if (error) {
    throw new Error(`No se pudo leer la imagen ${storagePath}: ${error.message}`);
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

async function createSignedFileUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    throw new Error(`No se pudo crear la URL firmada para ${storagePath}: ${error.message}`);
  }

  return data.signedUrl;
}

async function deleteStoragePaths(storagePaths) {
  const uniquePaths = [...new Set((storagePaths || []).filter(Boolean))];

  if (uniquePaths.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(uniquePaths);

  if (error) {
    logWarn('No se pudieron borrar algunos archivos del bucket', {
      bucket: STORAGE_BUCKET,
      error: error.message
    });
  }
}

async function countStorageReferences(storagePath, excludedRecords = []) {
  const isExcluded = (table, id) => excludedRecords.some((record) => record.table === table && record.id === id);

  const [{ data: looseRows, error: looseError }, { data: sessionRows, error: sessionError }] = await Promise.all([
    supabase.from('images').select('id').eq('storage_path', storagePath),
    supabase.from('session_images').select('id').eq('storage_path', storagePath)
  ]);

  if (looseError) {
    throw new Error(`No se pudieron revisar referencias en images: ${looseError.message}`);
  }

  if (sessionError) {
    throw new Error(`No se pudieron revisar referencias en session_images: ${sessionError.message}`);
  }

  const looseCount = (looseRows || []).filter((row) => !isExcluded('images', row.id)).length;
  const sessionCount = (sessionRows || []).filter((row) => !isExcluded('session_images', row.id)).length;
  return looseCount + sessionCount;
}

async function deleteStoragePathsIfUnreferenced(records = []) {
  const groupedRecords = new Map();

  for (const record of records) {
    if (!record?.storage_path) continue;
    const current = groupedRecords.get(record.storage_path) || [];
    current.push({ table: record.table, id: record.id });
    groupedRecords.set(record.storage_path, current);
  }

  const removablePaths = [];

  for (const [storagePath, excludedRecords] of groupedRecords.entries()) {
    const references = await countStorageReferences(storagePath, excludedRecords);
    if (references === 0) {
      removablePaths.push(storagePath);
    }
  }

  if (removablePaths.length > 0) {
    await deleteStoragePaths(removablePaths);
  }
}

async function serializeImage(row, options = {}) {
  const includeImageData = options.includeImageData !== false;
  const serialized = {
    _id: row.id,
    description: row.description || '',
    status: row.status || '',
    createdAt: row.created_at,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    signedUrl: await createSignedFileUrl(row.storage_path)
  };

  if (includeImageData) {
    serialized.imageData = await storageFileToDataUrl(row.storage_path, row.mime_type);
  }

  return serialized;
}

function shouldIncludeImageData(req) {
  return req.query.includeImageData !== 'false';
}

function isNoRowsError(error) {
  return error && (error.code === 'PGRST116' || error.details === 'The result contains 0 rows');
}

async function cleanupUploadedImages(images) {
  if (!images || images.length === 0) {
    return;
  }

  await deleteStoragePaths(images.map((image) => image.storage_path));
}

async function cleanupExpiredLooseImages() {
  const cutoffIso = new Date(Date.now() - (LOOSE_IMAGE_RETENTION_HOURS * 60 * 60 * 1000)).toISOString();

  const { data: expiredImages, error: expiredImagesError } = await supabase
    .from('images')
    .select('id, storage_path')
    .lt('created_at', cutoffIso);

  if (expiredImagesError) {
    logWarn('No se pudieron consultar las imágenes vencidas', { error: expiredImagesError.message });
    return;
  }

  if (!expiredImages || expiredImages.length === 0) {
    return;
  }

  const expiredIds = expiredImages.map((image) => image.id);
  const { error: deleteRowsError } = await supabase
    .from('images')
    .delete()
    .in('id', expiredIds);

  if (deleteRowsError) {
    logWarn('No se pudieron borrar las imágenes vencidas', { error: deleteRowsError.message });
    return;
  }

  await deleteStoragePathsIfUnreferenced(
    expiredImages.map((image) => ({
      table: 'images',
      id: image.id,
      storage_path: image.storage_path
    }))
  );

  logInfo('Limpieza de fotos sin sesión completada', {
    deletedImages: expiredIds.length,
    cutoffIso
  });
}

async function runScheduledLooseCleanup(reason = 'scheduled') {
  try {
    await cleanupExpiredLooseImages();
    logInfo('Revisión de limpieza automática terminada', { reason });
  } catch (error) {
    logError('Falló la limpieza automática de Sin sesión', error, { reason });
  }
}

async function findImageRecordById(id) {
  const { data: looseImage, error: looseError } = await supabase
    .from('images')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (looseError) {
    throw new Error(`No se pudo consultar la imagen: ${looseError.message}`);
  }

  if (looseImage) {
    return { table: 'images', row: looseImage };
  }

  const { data: sessionImage, error: sessionError } = await supabase
    .from('session_images')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (sessionError) {
    throw new Error(`No se pudo consultar la imagen de sesión: ${sessionError.message}`);
  }

  if (sessionImage) {
    return { table: 'session_images', row: sessionImage };
  }

  return null;
}

function buildSessionImagePayload(image, index, now, batchId) {
  const description = normalizeText(image.description);
  const status = normalizeText(image.status);
  const createdAt = image.createdAt || now;

  if (typeof image.imageData === 'string' && image.imageData.startsWith('data:image/')) {
    return {
      type: 'upload',
      imageData: image.imageData,
      description,
      status,
      position: index,
      created_at: createdAt,
      batch_id: batchId
    };
  }

  const storagePath = normalizeText(image.storagePath);
  const mimeType = normalizeText(image.mimeType);

  if (!storagePath || !mimeType) {
    throw new Error(`La imagen en la posición ${index + 1} no tiene datos válidos para guardarse.`);
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`La imagen en la posición ${index + 1} tiene un formato no soportado.`);
  }

  return {
    type: 'reference',
    storage_path: storagePath,
    mime_type: mimeType,
    description,
    status,
    position: index,
    created_at: createdAt,
    batch_id: batchId
  };
}

async function getStorageUsageSnapshot() {
  const collectedObjects = [];

  async function walkBucket(prefix = '') {
    let offset = 0;
    const limit = 100;

    while (true) {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(prefix, {
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (error) {
        throw new Error(`No se pudo consultar el uso del bucket: ${error.message}`);
      }

      const entries = data || [];
      if (entries.length === 0) {
        break;
      }

      for (const entry of entries) {
        const entryName = normalizeText(entry?.name);
        if (!entryName) continue;

        const metadata = entry?.metadata || {};
        const isFolder = !metadata || Object.keys(metadata).length === 0;
        const currentPath = prefix ? `${prefix}/${entryName}` : entryName;

        if (isFolder) {
          await walkBucket(currentPath);
          continue;
        }

        collectedObjects.push({
          storagePath: currentPath,
          metadata
        });
      }

      if (entries.length < limit) {
        break;
      }

      offset += entries.length;
    }
  }

  await walkBucket('');

  let usedBytes = collectedObjects.reduce((total, object) => {
    const sizeCandidates = [
      object?.metadata?.size,
      object?.metadata?.fileSize,
      object?.metadata?.contentLength,
      object?.metadata?.httpMetadata?.contentLength
    ];
    const detectedSize = sizeCandidates
      .map((value) => Number(value))
      .find((value) => Number.isFinite(value) && value > 0);

    return total + (detectedSize || 0);
  }, 0);

  if (collectedObjects.length > 0 && usedBytes === 0) {
    const fallbackSizes = await Promise.all(collectedObjects.map(async (object) => {
      const storagePath = object.storagePath;

      try {
        const signedUrl = await createSignedFileUrl(storagePath);
        const response = await fetch(signedUrl, { method: 'HEAD' });
        const contentLength = Number(response.headers.get('content-length') || 0);
        return Number.isFinite(contentLength) ? contentLength : 0;
      } catch (headError) {
        logWarn('No se pudo estimar el tamaño real de un archivo del bucket', {
          storagePath,
          error: headError?.message || headError
        });
        return 0;
      }
    }));

    usedBytes = fallbackSizes.reduce((sum, size) => sum + size, 0);
  }

  return {
    bucket: STORAGE_BUCKET,
    filesCount: collectedObjects.length,
    usedBytes,
    limitBytes: STORAGE_LIMIT_BYTES,
    usagePercent: STORAGE_LIMIT_BYTES > 0 ? Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100) : null
  };
}

async function findOrphanedSessions() {
  // Buscar sesiones que no tienen imágenes en el batch actual
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, name, current_batch_id');

  if (sessionsError) {
    throw new Error(`No se pudieron consultar sesiones: ${sessionsError.message}`);
  }

  if (!sessions || sessions.length === 0) {
    return [];
  }

  const orphaned = [];

  for (const session of sessions) {
    if (!session.current_batch_id) {
      // Sesión sin batch actual
      orphaned.push({
        id: session.id,
        name: session.name,
        reason: 'no_current_batch'
      });
      continue;
    }

    // Verificar si esa sesión tiene imágenes en su batch
    const { data: images, error: imagesError } = await supabase
      .from('session_images')
      .select('id')
      .eq('session_id', session.id)
      .eq('batch_id', session.current_batch_id);

    if (imagesError) {
      logWarn('No se pudo revisar imágenes de sesión', {
        sessionId: session.id,
        error: imagesError.message
      });
      continue;
    }

    if (!images || images.length === 0) {
      orphaned.push({
        id: session.id,
        name: session.name,
        reason: 'no_images_in_batch'
      });
    }
  }

  return orphaned;
}

async function deleteOrphanedSessions(orphanedList) {
  if (!orphanedList || orphanedList.length === 0) {
    return { deletedCount: 0, errors: [] };
  }

  const errors = [];
  let deletedCount = 0;

  for (const orphan of orphanedList) {
    try {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', orphan.id);

      if (error) {
        errors.push({
          sessionId: orphan.id,
          sessionName: orphan.name,
          error: error.message
        });
      } else {
        deletedCount++;
      }
    } catch (err) {
      errors.push({
        sessionId: orphan.id,
        sessionName: orphan.name,
        error: err.message
      });
    }
  }

  return { deletedCount, errors };
}

async function runMaintenanceTasks() {
  const startTime = Date.now();
  const results = {
    success: true,
    timestamp: new Date().toISOString(),
    durationMs: 0,
    tasks: {}
  };

  try {
    // Tarea 1: Limpiar imágenes temporales expiradas
    logInfo('Iniciando tarea de mantenimiento: limpieza de imágenes temporales...');
    try {
      const cutoffIso = new Date(Date.now() - (LOOSE_IMAGE_RETENTION_HOURS * 60 * 60 * 1000)).toISOString();
      const { data: expiredImages, error } = await supabase
        .from('images')
        .select('id, storage_path')
        .lt('created_at', cutoffIso);

      if (error) {
        throw error;
      }

      results.tasks.cleanupExpiredLoose = {
        success: true,
        processedCount: expiredImages?.length || 0,
        reason: `Limpieza de imágenes con más de ${LOOSE_IMAGE_RETENTION_HOURS} horas`
      };
    } catch (error) {
      results.tasks.cleanupExpiredLoose = {
        success: false,
        error: error.message
      };
      logWarn('Falló la limpieza de imágenes temporales', { error: error.message });
    }

    // Tarea 2: Revisar sesiones huérfanas
    logInfo('Iniciando tarea de mantenimiento: búsqueda de sesiones huérfanas...');
    try {
      const orphaned = await findOrphanedSessions();
      const cleanupResult = await deleteOrphanedSessions(orphaned);

      results.tasks.cleanupOrphanedSessions = {
        success: true,
        foundCount: orphaned.length,
        deletedCount: cleanupResult.deletedCount,
        errorCount: cleanupResult.errors.length,
        errors: cleanupResult.errors.slice(0, 5) // Mostrar solo los primeros 5 errores
      };

      if (cleanupResult.deletedCount > 0) {
        logInfo(`Limpieza de sesiones huérfanas completada`, {
          deletedCount: cleanupResult.deletedCount
        });
      }
    } catch (error) {
      results.tasks.cleanupOrphanedSessions = {
        success: false,
        error: error.message
      };
      logWarn('Falló la búsqueda de sesiones huérfanas', { error: error.message });
    }

    // Tarea 3: Obtener snapshot de uso de storage (verifica que Supabase responda)
    logInfo('Iniciando tarea de mantenimiento: verificación de uso de storage...');
    try {
      const usage = await getStorageUsageSnapshot();
      results.tasks.storageUsage = {
        success: true,
        filesCount: usage.filesCount,
        usedBytes: usage.usedBytes,
        limitBytes: usage.limitBytes,
        usagePercent: usage.usagePercent
      };

      logInfo('Snapshot de storage obtenido exitosamente', { usagePercent: usage.usagePercent });
    } catch (error) {
      results.tasks.storageUsage = {
        success: false,
        error: error.message
      };
      logWarn('Falló la obtención del snapshot de storage', { error: error.message });
    }

    // Tarea 4: Lectura simple de verificación (heartbeat)
    logInfo('Iniciando tarea de mantenimiento: heartbeat a Supabase...');
    try {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id')
        .limit(1);

      if (error) {
        throw error;
      }

      results.tasks.heartbeat = {
        success: true,
        timestamp: new Date().toISOString()
      };

      logInfo('Heartbeat exitoso', { timestamp: new Date().toISOString() });
    } catch (error) {
      results.tasks.heartbeat = {
        success: false,
        error: error.message
      };
      logWarn('Falló el heartbeat a Supabase', { error: error.message });
    }

    results.durationMs = Date.now() - startTime;
    logInfo('Ciclo de mantenimiento completado', {
      durationMs: results.durationMs,
      tasksSuccessful: Object.values(results.tasks).filter((t) => t.success).length,
      tasksTotal: Object.keys(results.tasks).length
    });

    return results;
  } catch (error) {
    results.success = false;
    results.error = error.message;
    results.durationMs = Date.now() - startTime;
    logError('Error general en ciclo de mantenimiento', error, { durationMs: results.durationMs });
    return results;
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true, database: 'supabase', bucket: STORAGE_BUCKET });
});

app.post('/maintenance', asyncHandler(async (req, res) => {
  const providedKey = req.query.key || req.body?.key;

  if (!providedKey || providedKey !== MAINTENANCE_KEY) {
    logWarn('Acceso rechazado a endpoint de mantenimiento', {
      endpoint: '/maintenance',
      hasKey: !!providedKey,
      ip: req.ip
    });
    return res.status(401).json({
      error: 'Clave de mantenimiento inválida o faltante',
      endpoint: '/maintenance?key=YOUR_KEY'
    });
  }

  const results = await runMaintenanceTasks();
  res.json(results);
}));

app.get('/maintenance', asyncHandler(async (req, res) => {
  const providedKey = req.query.key;

  if (!providedKey || providedKey !== MAINTENANCE_KEY) {
    logWarn('Acceso rechazado a endpoint de mantenimiento', {
      endpoint: '/maintenance',
      hasKey: !!providedKey,
      ip: req.ip
    });
    return res.status(401).json({
      error: 'Clave de mantenimiento inválida o faltante',
      endpoint: '/maintenance?key=YOUR_KEY'
    });
  }

  const results = await runMaintenanceTasks();
  res.json(results);
}));

app.get('/usage', asyncHandler(async (req, res) => {
  const usage = await getStorageUsageSnapshot();
  res.json(usage);
}));

app.get('/images', asyncHandler(async (req, res) => {
  await cleanupExpiredLooseImages();
  const includeImageData = shouldIncludeImageData(req);
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron consultar las imagenes: ${error.message}`);
  }

  const images = await Promise.all(
    data.map((row) => serializeImage(row, { includeImageData }))
  );
  res.json(images);
}));

app.post('/upload', asyncHandler(async (req, res) => {
  await cleanupExpiredLooseImages();
  const { imageData, description = '', status = '' } = req.body;

  if (!imageData) {
    return res.status(400).json({ error: 'Falta imageData' });
  }

  const upload = await uploadDataUrl(imageData, 'uploads');

  const { data, error } = await supabase
    .from('images')
    .insert({
      storage_path: upload.storagePath,
      mime_type: upload.mimeType,
      description,
      status
    })
    .select()
    .single();

  if (error) {
    await deleteStoragePaths([upload.storagePath]);
    throw new Error(`No se pudo guardar el registro de la imagen: ${error.message}`);
  }

  res.json(await serializeImage(data, { includeImageData: false }));
}));

app.put('/image/:id', asyncHandler(async (req, res) => {
  const { description = '', status = '' } = req.body;
  const found = await findImageRecordById(req.params.id);

  if (!found) {
    return res.status(404).json({ error: 'Imagen no encontrada' });
  }

  const { error } = await supabase
    .from(found.table)
    .update({ description, status })
    .eq('id', req.params.id);

  if (error) {
    throw new Error(`No se pudo actualizar la imagen: ${error.message}`);
  }

  res.json({
    ok: true,
    _id: found.row.id,
    description,
    status,
    createdAt: found.row.created_at,
    storagePath: found.row.storage_path,
    mimeType: found.row.mime_type
  });
}));

app.delete('/image/:id', asyncHandler(async (req, res) => {
  const found = await findImageRecordById(req.params.id);

  if (!found) {
    return res.status(404).json({ error: 'Imagen no encontrada' });
  }

  const { error } = await supabase
    .from(found.table)
    .delete()
    .eq('id', req.params.id);

  if (error) {
    throw new Error(`No se pudo eliminar la imagen: ${error.message}`);
  }

  await deleteStoragePathsIfUnreferenced([
    { table: found.table, id: found.row.id, storage_path: found.row.storage_path }
  ]);
  res.json({ ok: true });
}));

app.get('/sessions', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, name, created_at, updated_at, current_batch_id')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`No se pudieron consultar las sesiones: ${error.message}`);
  }

  let photoCountBySessionId = new Map();
  const activeBatchIds = data
    .map((session) => session.current_batch_id)
    .filter(Boolean);

  if (data.length > 0 && activeBatchIds.length > 0) {
    const { data: sessionImages, error: sessionImagesError } = await supabase
      .from('session_images')
      .select('session_id, batch_id')
      .in('session_id', data.map((session) => session.id))
      .in('batch_id', activeBatchIds);

    if (sessionImagesError) {
      throw new Error(`No se pudieron contar las imagenes de las sesiones: ${sessionImagesError.message}`);
    }

    photoCountBySessionId = sessionImages.reduce((acc, image) => {
      acc.set(image.session_id, (acc.get(image.session_id) || 0) + 1);
      return acc;
    }, new Map());
  }

  res.json(data.map((session) => ({
    name: session.name,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    photoCount: photoCountBySessionId.get(session.id) || 0
  })));
}));

app.post('/session', asyncHandler(async (req, res) => {
  const sessionName = validateSessionName(req.body.name);
  const { images } = req.body;

  if (!Array.isArray(images)) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  let preparedImages = [];
  let sessionData;
  let existingSession = null;
  const newBatchId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: existingSessionRow, error: existingSessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('name', sessionName)
    .maybeSingle();

  if (existingSessionError) {
    throw new Error(`No se pudo consultar la sesion actual: ${existingSessionError.message}`);
  }

  existingSession = existingSessionRow;

  try {
    preparedImages = await Promise.all(images.map(async (image, index) => {
      const payload = buildSessionImagePayload(image, index, now, newBatchId);

      if (payload.type === 'upload') {
        const upload = await uploadDataUrl(payload.imageData, 'sessions');
        return {
          storage_path: upload.storagePath,
          mime_type: upload.mimeType,
          description: payload.description,
          status: payload.status,
          position: payload.position,
          created_at: payload.created_at,
          batch_id: payload.batch_id,
          _uploaded: true
        };
      }

      return {
        storage_path: payload.storage_path,
        mime_type: payload.mime_type,
        description: payload.description,
        status: payload.status,
        position: payload.position,
        created_at: payload.created_at,
        batch_id: payload.batch_id,
        _uploaded: false
      };
    }));

    if (existingSession) {
      sessionData = existingSession;
    } else {
      const { data: createdSession, error: createSessionError } = await supabase
        .from('sessions')
        .insert({ name: sessionName, updated_at: now })
        .select()
        .single();

      if (createSessionError) {
        throw new Error(`No se pudo crear la sesion: ${createSessionError.message}`);
      }

      sessionData = createdSession;
    }

    if (preparedImages.length > 0) {
      const rows = preparedImages.map((image) => ({
        session_id: sessionData.id,
        storage_path: image.storage_path,
        mime_type: image.mime_type,
        description: image.description,
        status: image.status,
        position: image.position,
        created_at: image.created_at,
        batch_id: image.batch_id
      }));

      const { error: insertImagesError } = await supabase
        .from('session_images')
        .insert(rows);

      if (insertImagesError) {
        throw new Error(`No se pudieron guardar las imagenes de la sesion: ${insertImagesError.message}`);
      }
    }

    const { error: updateSessionError } = await supabase
      .from('sessions')
      .update({
        updated_at: now,
        current_batch_id: preparedImages.length > 0 ? newBatchId : null
      })
      .eq('id', sessionData.id);

    if (updateSessionError) {
      throw new Error(`No se pudo actualizar la version activa de la sesion: ${updateSessionError.message}`);
    }

    const oldBatchId = existingSession ? existingSession.current_batch_id : null;
    let oldImages = [];

    if (oldBatchId) {
      const { data: oldRows, error: oldImagesError } = await supabase
        .from('session_images')
        .select('id, storage_path')
        .eq('session_id', sessionData.id)
        .eq('batch_id', oldBatchId);

      if (oldImagesError) {
        throw new Error(`No se pudieron leer las imagenes anteriores de la sesion: ${oldImagesError.message}`);
      }

      oldImages = oldRows || [];
    }

    if (oldImages.length > 0) {
      const { error: deleteOldRowsError } = await supabase
        .from('session_images')
        .delete()
        .in('id', oldImages.map((image) => image.id));

      if (deleteOldRowsError) {
        throw new Error(`No se pudo limpiar la version anterior de la sesion: ${deleteOldRowsError.message}`);
      }

      await deleteStoragePathsIfUnreferenced(
        oldImages.map((image) => ({
          table: 'session_images',
          id: image.id,
          storage_path: image.storage_path
        }))
      );
    }

    const { data: savedSession, error: savedSessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionData.id)
      .single();

    if (savedSessionError) {
      throw new Error(`No se pudo leer la sesion guardada: ${savedSessionError.message}`);
    }

    const includeImageData = shouldIncludeImageData(req);
    let savedRows = [];

    if (savedSession.current_batch_id) {
      const { data: fetchedRows, error: savedRowsError } = await supabase
        .from('session_images')
        .select('*')
        .eq('session_id', sessionData.id)
        .eq('batch_id', savedSession.current_batch_id)
        .order('position', { ascending: true });

      if (savedRowsError) {
        throw new Error(`La sesion se guardo pero no se pudo leer su contenido: ${savedRowsError.message}`);
      }

      savedRows = fetchedRows || [];
    }

    res.json({
      id: savedSession.id,
      name: savedSession.name,
      createdAt: savedSession.created_at,
      updatedAt: savedSession.updated_at,
      currentBatchId: savedSession.current_batch_id,
      images: await Promise.all(
        savedRows.map((row) => serializeImage(row, { includeImageData }))
      )
    });
  } catch (error) {
    if (sessionData && preparedImages.length > 0) {
      const { data: insertedRows } = await supabase
        .from('session_images')
        .select('id, storage_path')
        .eq('session_id', sessionData.id)
        .eq('batch_id', newBatchId);

      if (insertedRows && insertedRows.length > 0) {
        await supabase
          .from('session_images')
          .delete()
          .in('id', insertedRows.map((row) => row.id));

        await deleteStoragePathsIfUnreferenced(
          insertedRows.map((row) => ({
            table: 'session_images',
            id: row.id,
            storage_path: row.storage_path
          }))
        );
      }
    }

    if (!existingSession && sessionData) {
      await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionData.id)
        .is('current_batch_id', null);
    }

    await cleanupUploadedImages(preparedImages.filter((image) => image._uploaded));
    throw error;
  }
}));

app.get('/session/:name', asyncHandler(async (req, res) => {
  const includeImageData = shouldIncludeImageData(req);
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('name', req.params.name)
    .single();

  if (sessionError || !session) {
    return res.status(404).json({ error: 'Sesion no encontrada' });
  }

  if (!session.current_batch_id) {
    return res.json({
      id: session.id,
      name: session.name,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      currentBatchId: null,
      images: []
    });
  }

  const { data: images, error: imagesError } = await supabase
    .from('session_images')
    .select('*')
    .eq('session_id', session.id)
    .eq('batch_id', session.current_batch_id)
    .order('position', { ascending: true });

  if (imagesError) {
    throw new Error(`No se pudieron leer las imagenes de la sesion: ${imagesError.message}`);
  }

  res.json({
    id: session.id,
    name: session.name,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    currentBatchId: session.current_batch_id,
    images: await Promise.all(
      images.map((row) => serializeImage(row, { includeImageData }))
    )
  });
}));

app.delete('/session/:name', asyncHandler(async (req, res) => {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('name', req.params.name)
    .single();

  if (sessionError || !session) {
    return res.status(404).json({ error: 'Sesion no encontrada' });
  }

  const { data: images, error: imagesError } = await supabase
    .from('session_images')
    .select('id, storage_path')
    .eq('session_id', session.id);

  if (imagesError) {
    throw new Error(`No se pudieron leer las imagenes de la sesion: ${imagesError.message}`);
  }

  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', session.id);

  if (error) {
    throw new Error(`No se pudo eliminar la sesion: ${error.message}`);
  }

  await deleteStoragePathsIfUnreferenced(
    images.map((image) => ({
      table: 'session_images',
      id: image.id,
      storage_path: image.storage_path
    }))
  );
  res.json({ ok: true });
}));

app.delete('/sessions', asyncHandler(async (req, res) => {
  const { data: images, error: imagesError } = await supabase
    .from('session_images')
    .select('id, storage_path');

  if (imagesError) {
    throw new Error(`No se pudieron leer las imagenes de las sesiones: ${imagesError.message}`);
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id');

  if (sessionsError) {
    throw new Error(`No se pudieron leer las sesiones: ${sessionsError.message}`);
  }

  if (sessions.length > 0) {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .in('id', sessions.map((session) => session.id));

    if (error) {
      throw new Error(`No se pudieron eliminar las sesiones: ${error.message}`);
    }
  }

  await deleteStoragePathsIfUnreferenced(
    images.map((image) => ({
      table: 'session_images',
      id: image.id,
      storage_path: image.storage_path
    }))
  );
  res.json({ ok: true });
}));

app.delete('/images', asyncHandler(async (req, res) => {
  const { data: looseImages, error: looseImagesError } = await supabase
    .from('images')
    .select('id, storage_path');

  if (looseImagesError) {
    throw new Error(`No se pudieron leer las imagenes sin sesion: ${looseImagesError.message}`);
  }

  if (looseImages.length > 0) {
    const { error: deleteLooseError } = await supabase
      .from('images')
      .delete()
      .in('id', looseImages.map((image) => image.id));

    if (deleteLooseError) {
      throw new Error(`No se pudieron borrar las imagenes sin sesion: ${deleteLooseError.message}`);
    }
  }

  await deleteStoragePathsIfUnreferenced(
    looseImages.map((image) => ({
      table: 'images',
      id: image.id,
      storage_path: image.storage_path
    }))
  );
  res.json({ ok: true, looseImages: looseImages.length });
}));

app.delete('/session/:name/images', asyncHandler(async (req, res) => {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('name', req.params.name)
    .single();

  if (sessionError || !session) {
    return res.status(404).json({ error: 'Sesion no encontrada' });
  }

  const { data: sessionImages, error: sessionImagesError } = await supabase
    .from('session_images')
    .select('id, storage_path')
    .eq('session_id', session.id);

  if (sessionImagesError) {
    throw new Error(`No se pudieron leer las imagenes de la sesion: ${sessionImagesError.message}`);
  }

  if (sessionImages.length > 0) {
    const { error: deleteImagesError } = await supabase
      .from('session_images')
      .delete()
      .in('id', sessionImages.map((image) => image.id));

    if (deleteImagesError) {
      throw new Error(`No se pudieron borrar las imagenes de la sesion: ${deleteImagesError.message}`);
    }
  }

  const { error: updateSessionError } = await supabase
    .from('sessions')
    .update({ current_batch_id: null, updated_at: new Date().toISOString() })
    .eq('id', session.id);

  if (updateSessionError) {
    throw new Error(`No se pudo vaciar la sesion: ${updateSessionError.message}`);
  }

  await deleteStoragePathsIfUnreferenced(
    sessionImages.map((image) => ({
      table: 'session_images',
      id: image.id,
      storage_path: image.storage_path
    }))
  );
  res.json({ ok: true, sessionImages: sessionImages.length });
}));

setInterval(() => {
  runScheduledLooseCleanup('interval');
}, CLEANUP_INTERVAL_MS);

runScheduledLooseCleanup('startup');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, () => {
  logInfo(`Servidor backend escuchando en puerto ${PORT} usando Supabase`, {
    bucket: STORAGE_BUCKET,
    looseRetentionHours: LOOSE_IMAGE_RETENTION_HOURS
  });
});
