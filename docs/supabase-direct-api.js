(function () {
  const SUPABASE_URL = window.REPORTES_SUPABASE_URL || '';
  const SUPABASE_PUBLISHABLE_KEY = window.REPORTES_SUPABASE_PUBLISHABLE_KEY || '';
  const SUPABASE_STORAGE_BUCKET = window.REPORTES_SUPABASE_BUCKET || 'report-images';
  const SUPABASE_STORAGE_LIMIT_BYTES = Number(window.REPORTES_SUPABASE_STORAGE_LIMIT_BYTES || 1024 * 1024 * 1024);
  const CLIENT_MAX_IMAGE_BYTES = Number(window.REPORTES_SUPABASE_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
  const CLIENT_ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif'
  ]);
  const LOOSE_IMAGE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

  let supabaseClient = null;
  let readyPromise = null;

  function createApiResponse(payload, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return payload;
      },
      async text() {
        if (typeof payload === 'string') return payload;
        if (payload && typeof payload.error === 'string') return payload.error;
        return JSON.stringify(payload);
      }
    };
  }

  function formatSupabaseError(error, fallback = 'No se pudo conectar con Supabase.') {
    const message = error && error.message ? error.message : fallback;
    if (/Failed to fetch|fetch failed|network/i.test(message)) {
      return 'No se pudo conectar con Supabase. Si tu proyecto fue pausado, entra al dashboard y presiona Unpause.';
    }
    return message;
  }

  function normalizeText(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function validateSessionName(name) {
    const normalized = normalizeText(name);
    if (!normalized) throw new Error('El nombre de la sesión es obligatorio.');
    if (normalized.length > 120) throw new Error('El nombre de la sesión no puede superar 120 caracteres.');
    return normalized;
  }

  function getClient() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('No se pudo cargar la librería de Supabase en el navegador.');
    }
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Falta la configuración pública de Supabase en el frontend.');
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    return supabaseClient;
  }

  async function ensureReady() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      const client = getClient();
      const { error } = await client
        .from('sessions')
        .select('id', { head: true, count: 'exact' })
        .limit(1);

      if (error) {
        throw new Error(formatSupabaseError(error, 'No se pudo validar la conexión con Supabase.'));
      }

      return SUPABASE_URL;
    })();

    try {
      return await readyPromise;
    } finally {
      if (!supabaseClient) readyPromise = null;
    }
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

  function parseDataUrl(dataUrl) {
    const match = /^data:(.+?);base64,(.+)$/s.exec(dataUrl || '');
    if (!match) throw new Error('Formato de imagen no válido. Se esperaba un data URL en base64.');

    const mimeType = match[1];
    if (!CLIENT_ALLOWED_IMAGE_TYPES.has(mimeType)) {
      throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
    }

    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    if (!bytes.length) throw new Error('La imagen está vacía.');
    if (bytes.length > CLIENT_MAX_IMAGE_BYTES) {
      throw new Error(`La imagen supera el máximo permitido de ${Math.round(CLIENT_MAX_IMAGE_BYTES / (1024 * 1024))} MB.`);
    }

    return {
      mimeType,
      sizeBytes: bytes.length,
      blob: new Blob([bytes], { type: mimeType })
    };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer la imagen desde Storage.'));
      reader.readAsDataURL(blob);
    });
  }

  function getPublicFileUrl(storagePath) {
    const client = getClient();
    const { data } = client.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    return data.publicUrl;
  }

  async function downloadStorageAsDataUrl(storagePath) {
    const client = getClient();
    const { data, error } = await client.storage.from(SUPABASE_STORAGE_BUCKET).download(storagePath);
    if (error) throw new Error(`No se pudo leer la imagen ${storagePath}: ${error.message}`);
    return blobToDataUrl(data);
  }

  async function uploadDataUrl(dataUrl, folder) {
    const client = getClient();
    const parsed = parseDataUrl(dataUrl);
    const extension = getFileExtension(parsed.mimeType);
    const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error } = await client.storage.from(SUPABASE_STORAGE_BUCKET).upload(storagePath, parsed.blob, {
      contentType: parsed.mimeType,
      upsert: false
    });

    if (error) throw new Error(`No se pudo subir la imagen a Storage: ${error.message}`);

    return {
      storagePath,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes
    };
  }

  async function deleteStoragePaths(storagePaths) {
    const uniquePaths = [...new Set((storagePaths || []).filter(Boolean))];
    if (uniquePaths.length === 0) return;
    const client = getClient();
    const { error } = await client.storage.from(SUPABASE_STORAGE_BUCKET).remove(uniquePaths);
    if (error) console.warn('No se pudieron borrar algunos archivos del bucket', error.message);
  }

  async function countStorageReferences(storagePath, excludedRecords = []) {
    const client = getClient();
    const isExcluded = (table, id) => excludedRecords.some((record) => record.table === table && record.id === id);

    const [{ data: looseRows, error: looseError }, { data: sessionRows, error: sessionError }] = await Promise.all([
      client.from('images').select('id').eq('storage_path', storagePath),
      client.from('session_images').select('id').eq('storage_path', storagePath)
    ]);

    if (looseError) throw new Error(`No se pudieron revisar referencias en images: ${looseError.message}`);
    if (sessionError) throw new Error(`No se pudieron revisar referencias en session_images: ${sessionError.message}`);

    const looseCount = (looseRows || []).filter((row) => !isExcluded('images', row.id)).length;
    const sessionCount = (sessionRows || []).filter((row) => !isExcluded('session_images', row.id)).length;
    return looseCount + sessionCount;
  }

  async function deleteStoragePathsIfUnreferenced(records = []) {
    const groupedRecords = new Map();

    for (const record of records) {
      if (!record || !record.storage_path) continue;
      const current = groupedRecords.get(record.storage_path) || [];
      current.push({ table: record.table, id: record.id });
      groupedRecords.set(record.storage_path, current);
    }

    const removablePaths = [];
    for (const [storagePath, excludedRecords] of groupedRecords.entries()) {
      const references = await countStorageReferences(storagePath, excludedRecords);
      if (references === 0) removablePaths.push(storagePath);
    }

    await deleteStoragePaths(removablePaths);
  }

  async function serializeImageRow(row, options = {}) {
    const includeImageData = options.includeImageData !== false;
    const serialized = {
      _id: row.id,
      description: row.description || '',
      status: row.status || '',
      createdAt: row.created_at,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      signedUrl: getPublicFileUrl(row.storage_path)
    };

    if (includeImageData) {
      serialized.imageData = await downloadStorageAsDataUrl(row.storage_path);
    }

    return serialized;
  }

  function includeImageDataFromUrl(url) {
    return url.searchParams.get('includeImageData') !== 'false';
  }

  async function cleanupExpiredLooseImages() {
    const client = getClient();
    const cutoffIso = new Date(Date.now() - LOOSE_IMAGE_RETENTION_MS).toISOString();
    const { data: expiredImages, error } = await client
      .from('images')
      .select('id, storage_path')
      .lt('created_at', cutoffIso);

    if (error) throw new Error(`No se pudieron consultar las imágenes sin sesión vencidas: ${error.message}`);
    if (!expiredImages || expiredImages.length === 0) return;

    const { error: deleteError } = await client.from('images').delete().in('id', expiredImages.map((image) => image.id));
    if (deleteError) throw new Error(`No se pudieron borrar las imágenes sin sesión vencidas: ${deleteError.message}`);

    await deleteStoragePathsIfUnreferenced(
      expiredImages.map((image) => ({
        table: 'images',
        id: image.id,
        storage_path: image.storage_path
      }))
    );
  }

  async function findImageRecordById(id) {
    const client = getClient();
    const { data: looseImage, error: looseError } = await client.from('images').select('*').eq('id', id).maybeSingle();
    if (looseError) throw new Error(`No se pudo consultar la imagen: ${looseError.message}`);
    if (looseImage) return { table: 'images', row: looseImage };

    const { data: sessionImage, error: sessionError } = await client.from('session_images').select('*').eq('id', id).maybeSingle();
    if (sessionError) throw new Error(`No se pudo consultar la imagen de sesión: ${sessionError.message}`);
    if (sessionImage) return { table: 'session_images', row: sessionImage };

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

    if (!CLIENT_ALLOWED_IMAGE_TYPES.has(mimeType)) {
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
    const client = getClient();
    const collectedObjects = [];

    async function walkBucket(prefix = '') {
      let offset = 0;
      const limit = 100;

      while (true) {
        const { data, error } = await client.storage.from(SUPABASE_STORAGE_BUCKET).list(prefix, {
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' }
        });

        if (error) throw new Error(`No se pudo consultar el uso del bucket: ${error.message}`);

        const entries = data || [];
        if (entries.length === 0) break;

        for (const entry of entries) {
          const entryName = normalizeText(entry && entry.name);
          if (!entryName) continue;

          const metadata = entry && entry.metadata ? entry.metadata : {};
          const isFolder = !metadata || Object.keys(metadata).length === 0;
          const currentPath = prefix ? `${prefix}/${entryName}` : entryName;

          if (isFolder) {
            await walkBucket(currentPath);
            continue;
          }

          collectedObjects.push({ storagePath: currentPath, metadata });
        }

        if (entries.length < limit) break;
        offset += entries.length;
      }
    }

    await walkBucket('');

    const usedBytes = collectedObjects.reduce((total, object) => {
      const metadata = object.metadata || {};
      const objectSize = Number(metadata.size || metadata.bytes || metadata.fileSize || 0);
      return total + (Number.isFinite(objectSize) ? objectSize : 0);
    }, 0);

    const [{ count: looseCount, error: looseCountError }, { count: sessionCount, error: sessionCountError }] = await Promise.all([
      client.from('images').select('id', { count: 'exact', head: true }),
      client.from('session_images').select('id', { count: 'exact', head: true })
    ]);

    if (looseCountError) throw new Error(`No se pudo contar las imágenes sueltas: ${looseCountError.message}`);
    if (sessionCountError) throw new Error(`No se pudo contar las imágenes de sesión: ${sessionCountError.message}`);

    const filesCount = Number(looseCount || 0) + Number(sessionCount || 0);

    return {
      usedBytes,
      limitBytes: SUPABASE_STORAGE_LIMIT_BYTES,
      filesCount,
      usagePercent: SUPABASE_STORAGE_LIMIT_BYTES > 0 ? (usedBytes / SUPABASE_STORAGE_LIMIT_BYTES) * 100 : 0
    };
  }

  async function getSessionsList() {
    const client = getClient();
    const { data: sessions, error } = await client
      .from('sessions')
      .select('id, name, created_at, updated_at, current_batch_id')
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`No se pudieron consultar las sesiones: ${error.message}`);

    let photoCountBySessionId = new Map();
    const activeBatchIds = (sessions || []).map((session) => session.current_batch_id).filter(Boolean);

    if ((sessions || []).length > 0 && activeBatchIds.length > 0) {
      const { data: sessionImages, error: sessionImagesError } = await getClient()
        .from('session_images')
        .select('session_id, batch_id')
        .in('session_id', sessions.map((session) => session.id))
        .in('batch_id', activeBatchIds);

      if (sessionImagesError) {
        throw new Error(`No se pudieron contar las imagenes de las sesiones: ${sessionImagesError.message}`);
      }

      photoCountBySessionId = (sessionImages || []).reduce((acc, image) => {
        acc.set(image.session_id, (acc.get(image.session_id) || 0) + 1);
        return acc;
      }, new Map());
    }

    return (sessions || []).map((session) => ({
      name: session.name,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      photoCount: photoCountBySessionId.get(session.id) || 0
    }));
  }

  async function getSessionByName(name, includeImageData) {
    const client = getClient();
    const { data: session, error: sessionError } = await client
      .from('sessions')
      .select('*')
      .eq('name', name)
      .single();

    if (sessionError || !session) {
      throw Object.assign(new Error('Sesion no encontrada'), { status: 404 });
    }

    if (!session.current_batch_id) {
      return {
        id: session.id,
        name: session.name,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        currentBatchId: null,
        images: []
      };
    }

    const { data: images, error: imagesError } = await client
      .from('session_images')
      .select('*')
      .eq('session_id', session.id)
      .eq('batch_id', session.current_batch_id)
      .order('position', { ascending: true });

    if (imagesError) throw new Error(`No se pudieron leer las imagenes de la sesion: ${imagesError.message}`);

    return {
      id: session.id,
      name: session.name,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      currentBatchId: session.current_batch_id,
      images: await Promise.all((images || []).map((row) => serializeImageRow(row, { includeImageData })))
    };
  }

  async function saveSession(body, includeImageData) {
    const client = getClient();
    const sessionName = validateSessionName(body.name);
    const images = body.images;

    if (!Array.isArray(images)) throw Object.assign(new Error('Faltan datos'), { status: 400 });

    let preparedImages = [];
    let sessionData;
    let existingSession = null;
    const newBatchId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { data: existingSessionRow, error: existingSessionError } = await client
      .from('sessions')
      .select('*')
      .eq('name', sessionName)
      .maybeSingle();

    if (existingSessionError) throw new Error(`No se pudo consultar la sesion actual: ${existingSessionError.message}`);

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
        const { data: createdSession, error: createSessionError } = await client
          .from('sessions')
          .insert({ name: sessionName, updated_at: now })
          .select()
          .single();

        if (createSessionError) throw new Error(`No se pudo crear la sesion: ${createSessionError.message}`);
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

        const { error: insertImagesError } = await client.from('session_images').insert(rows);
        if (insertImagesError) throw new Error(`No se pudieron guardar las imagenes de la sesion: ${insertImagesError.message}`);
      }

      const { error: updateSessionError } = await client
        .from('sessions')
        .update({
          updated_at: now,
          current_batch_id: preparedImages.length > 0 ? newBatchId : null
        })
        .eq('id', sessionData.id);

      if (updateSessionError) throw new Error(`No se pudo actualizar la version activa de la sesion: ${updateSessionError.message}`);

      const oldBatchId = existingSession ? existingSession.current_batch_id : null;
      let oldImages = [];

      if (oldBatchId) {
        const { data: oldRows, error: oldImagesError } = await client
          .from('session_images')
          .select('id, storage_path')
          .eq('session_id', sessionData.id)
          .eq('batch_id', oldBatchId);

        if (oldImagesError) throw new Error(`No se pudieron leer las imagenes anteriores de la sesion: ${oldImagesError.message}`);
        oldImages = oldRows || [];
      }

      if (oldImages.length > 0) {
        const { error: deleteOldRowsError } = await client.from('session_images').delete().in('id', oldImages.map((image) => image.id));
        if (deleteOldRowsError) throw new Error(`No se pudo limpiar la version anterior de la sesion: ${deleteOldRowsError.message}`);

        await deleteStoragePathsIfUnreferenced(
          oldImages.map((image) => ({
            table: 'session_images',
            id: image.id,
            storage_path: image.storage_path
          }))
        );
      }

      const { data: savedSession, error: savedSessionError } = await client.from('sessions').select('*').eq('id', sessionData.id).single();
      if (savedSessionError) throw new Error(`No se pudo leer la sesion guardada: ${savedSessionError.message}`);

      let savedRows = [];
      if (savedSession.current_batch_id) {
        const { data: fetchedRows, error: savedRowsError } = await client
          .from('session_images')
          .select('*')
          .eq('session_id', sessionData.id)
          .eq('batch_id', savedSession.current_batch_id)
          .order('position', { ascending: true });

        if (savedRowsError) throw new Error(`La sesion se guardó pero no se pudo leer su contenido: ${savedRowsError.message}`);
        savedRows = fetchedRows || [];
      }

      return {
        id: savedSession.id,
        name: savedSession.name,
        createdAt: savedSession.created_at,
        updatedAt: savedSession.updated_at,
        currentBatchId: savedSession.current_batch_id,
        images: await Promise.all(savedRows.map((row) => serializeImageRow(row, { includeImageData })))
      };
    } catch (error) {
      if (sessionData && preparedImages.length > 0) {
        const { data: insertedRows } = await client
          .from('session_images')
          .select('id, storage_path')
          .eq('session_id', sessionData.id)
          .eq('batch_id', newBatchId);

        if (insertedRows && insertedRows.length > 0) {
          await client.from('session_images').delete().in('id', insertedRows.map((row) => row.id));
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
        await client.from('sessions').delete().eq('id', sessionData.id).is('current_batch_id', null);
      }

      await deleteStoragePaths(
        preparedImages.filter((image) => image._uploaded).map((image) => image.storage_path)
      );
      throw error;
    }
  }

  async function routeRequest(path, options = {}) {
    const client = getClient();
    const requestUrl = new URL(path, 'https://backend-reportes.local');
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;

    if (method === 'GET' && requestUrl.pathname === '/health') {
      return createApiResponse({ ok: true, database: 'supabase', bucket: SUPABASE_STORAGE_BUCKET });
    }

    if (method === 'GET' && requestUrl.pathname === '/usage') {
      return createApiResponse(await getStorageUsageSnapshot());
    }

    if (method === 'GET' && requestUrl.pathname === '/images') {
      await cleanupExpiredLooseImages();
      const includeImageData = includeImageDataFromUrl(requestUrl);
      const { data, error } = await client.from('images').select('*').order('created_at', { ascending: true });
      if (error) throw new Error(`No se pudieron consultar las imagenes: ${error.message}`);
      return createApiResponse(await Promise.all((data || []).map((row) => serializeImageRow(row, { includeImageData }))));
    }

    if (method === 'POST' && requestUrl.pathname === '/upload') {
      await cleanupExpiredLooseImages();
      const { imageData, description = '', status = '' } = body || {};
      if (!imageData) return createApiResponse({ error: 'Falta imageData' }, 400);

      const upload = await uploadDataUrl(imageData, 'uploads');
      const { data, error } = await client
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

      return createApiResponse(await serializeImageRow(data, { includeImageData: false }));
    }

    const imageMatch = requestUrl.pathname.match(/^\/image\/([^/]+)$/);
    if (imageMatch && method === 'PUT') {
      const { description = '', status = '', imageData = '' } = body || {};
      const found = await findImageRecordById(decodeURIComponent(imageMatch[1]));
      if (!found) return createApiResponse({ error: 'Imagen no encontrada' }, 404);
      let nextStoragePath = found.row.storage_path;
      let nextMimeType = found.row.mime_type;
      let newUpload = null;

      if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
        newUpload = await uploadDataUrl(imageData, found.table === 'session_images' ? 'sessions' : 'uploads');
        nextStoragePath = newUpload.storagePath;
        nextMimeType = newUpload.mimeType;
      }

      const { data: updatedRow, error } = await client
        .from(found.table)
        .update({
          description,
          status,
          storage_path: nextStoragePath,
          mime_type: nextMimeType
        })
        .eq('id', found.row.id)
        .select()
        .single();

      if (error) {
        if (newUpload) {
          await deleteStoragePaths([newUpload.storagePath]);
        }
        throw new Error(`No se pudo actualizar la imagen: ${error.message}`);
      }

      if (newUpload && found.row.storage_path && found.row.storage_path !== newUpload.storagePath) {
        await deleteStoragePathsIfUnreferenced([
          { table: found.table, id: found.row.id, storage_path: found.row.storage_path }
        ]);
      }

      return createApiResponse(await serializeImageRow(updatedRow, { includeImageData: false }));
    }

    if (imageMatch && method === 'DELETE') {
      const found = await findImageRecordById(decodeURIComponent(imageMatch[1]));
      if (!found) return createApiResponse({ error: 'Imagen no encontrada' }, 404);

      const { error } = await client.from(found.table).delete().eq('id', found.row.id);
      if (error) throw new Error(`No se pudo eliminar la imagen: ${error.message}`);

      await deleteStoragePathsIfUnreferenced([
        { table: found.table, id: found.row.id, storage_path: found.row.storage_path }
      ]);
      return createApiResponse({ ok: true });
    }

    if (method === 'GET' && requestUrl.pathname === '/sessions') {
      return createApiResponse(await getSessionsList());
    }

    if (method === 'POST' && requestUrl.pathname === '/session') {
      return createApiResponse(await saveSession(body || {}, includeImageDataFromUrl(requestUrl)));
    }

    const sessionMatch = requestUrl.pathname.match(/^\/session\/([^/]+)$/);
    if (sessionMatch && method === 'GET') {
      return createApiResponse(await getSessionByName(decodeURIComponent(sessionMatch[1]), includeImageDataFromUrl(requestUrl)));
    }

    if (sessionMatch && method === 'DELETE') {
      const sessionName = decodeURIComponent(sessionMatch[1]);
      const { data: session, error: sessionError } = await client.from('sessions').select('id').eq('name', sessionName).single();
      if (sessionError || !session) return createApiResponse({ error: 'Sesion no encontrada' }, 404);

      const { data: images, error: imagesError } = await client.from('session_images').select('id, storage_path').eq('session_id', session.id);
      if (imagesError) throw new Error(`No se pudieron leer las imagenes de la sesion: ${imagesError.message}`);

      const { error } = await client.from('sessions').delete().eq('id', session.id);
      if (error) throw new Error(`No se pudo eliminar la sesion: ${error.message}`);

      await deleteStoragePathsIfUnreferenced(
        (images || []).map((image) => ({
          table: 'session_images',
          id: image.id,
          storage_path: image.storage_path
        }))
      );
      return createApiResponse({ ok: true });
    }

    if (method === 'DELETE' && requestUrl.pathname === '/sessions') {
      const { data: images, error: imagesError } = await client.from('session_images').select('id, storage_path');
      if (imagesError) throw new Error(`No se pudieron leer las imagenes de las sesiones: ${imagesError.message}`);

      const { data: sessions, error: sessionsError } = await client.from('sessions').select('id');
      if (sessionsError) throw new Error(`No se pudieron leer las sesiones: ${sessionsError.message}`);

      if ((sessions || []).length > 0) {
        const { error } = await client.from('sessions').delete().in('id', sessions.map((session) => session.id));
        if (error) throw new Error(`No se pudieron eliminar las sesiones: ${error.message}`);
      }

      await deleteStoragePathsIfUnreferenced(
        (images || []).map((image) => ({
          table: 'session_images',
          id: image.id,
          storage_path: image.storage_path
        }))
      );
      return createApiResponse({ ok: true });
    }

    if (method === 'DELETE' && requestUrl.pathname === '/images') {
      const { data: looseImages, error: looseImagesError } = await client.from('images').select('id, storage_path');
      if (looseImagesError) throw new Error(`No se pudieron leer las imagenes sin sesion: ${looseImagesError.message}`);

      if ((looseImages || []).length > 0) {
        const { error: deleteLooseError } = await client.from('images').delete().in('id', looseImages.map((image) => image.id));
        if (deleteLooseError) throw new Error(`No se pudieron borrar las imagenes sin sesion: ${deleteLooseError.message}`);
      }

      await deleteStoragePathsIfUnreferenced(
        (looseImages || []).map((image) => ({
          table: 'images',
          id: image.id,
          storage_path: image.storage_path
        }))
      );
      return createApiResponse({ ok: true, looseImages: (looseImages || []).length });
    }

    const sessionImagesMatch = requestUrl.pathname.match(/^\/session\/([^/]+)\/images$/);
    if (sessionImagesMatch && method === 'DELETE') {
      const sessionName = decodeURIComponent(sessionImagesMatch[1]);
      const { data: session, error: sessionError } = await client.from('sessions').select('*').eq('name', sessionName).single();
      if (sessionError || !session) return createApiResponse({ error: 'Sesion no encontrada' }, 404);

      const { data: sessionImages, error: sessionImagesError } = await client.from('session_images').select('id, storage_path').eq('session_id', session.id);
      if (sessionImagesError) throw new Error(`No se pudieron leer las imagenes de la sesion: ${sessionImagesError.message}`);

      if ((sessionImages || []).length > 0) {
        const { error: deleteImagesError } = await client.from('session_images').delete().in('id', sessionImages.map((image) => image.id));
        if (deleteImagesError) throw new Error(`No se pudieron borrar las imagenes de la sesion: ${deleteImagesError.message}`);
      }

      const { error: updateSessionError } = await client
        .from('sessions')
        .update({ current_batch_id: null, updated_at: new Date().toISOString() })
        .eq('id', session.id);

      if (updateSessionError) throw new Error(`No se pudo vaciar la sesion: ${updateSessionError.message}`);

      await deleteStoragePathsIfUnreferenced(
        (sessionImages || []).map((image) => ({
          table: 'session_images',
          id: image.id,
          storage_path: image.storage_path
        }))
      );
      return createApiResponse({ ok: true, sessionImages: (sessionImages || []).length });
    }

    return createApiResponse({ error: 'Ruta no encontrada' }, 404);
  }

  window.directSupabaseBridge = {
    ensureReady,
    resolveApiBaseUrl: async () => {
      await ensureReady();
      return SUPABASE_URL;
    },
    apiFetch: async (path, options) => {
      try {
        await ensureReady();
        return await routeRequest(path, options);
      } catch (error) {
        return createApiResponse({ error: formatSupabaseError(error) }, error && error.status ? error.status : 500);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 💓 HEARTBEAT AUTOMÁTICO PARA SUPABASE FREE
  // ═══════════════════════════════════════════════════════════════
  // Ejecuta una query ligera cada 10 minutos para evitar que Supabase
  // Free pause el proyecto por inactividad
  // ═══════════════════════════════════════════════════════════════

  async function performHeartbeat() {
    try {
      const client = getClient();
      // Query simple: contar sesiones (muy ligera, sin aggregate function)
      const { error } = await client
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      if (!error) {
        console.log('[backend-reportes] ❤️ Heartbeat exitoso', new Date().toISOString());
      } else {
        console.warn('[backend-reportes] Heartbeat con error:', error.message);
      }
    } catch (err) {
      console.warn('[backend-reportes] Heartbeat falló:', err.message);
    }
  }

  // Ejecutar heartbeat al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      performHeartbeat();
      // Luego cada 10 minutos (600000 ms)
      setInterval(performHeartbeat, 10 * 60 * 1000);
    });
  } else {
    performHeartbeat();
    setInterval(performHeartbeat, 10 * 60 * 1000);
  }
})();
