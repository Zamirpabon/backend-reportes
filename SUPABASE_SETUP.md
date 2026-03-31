# Configuracion de Supabase

1. Crea un proyecto en Supabase.
2. Ve a `SQL Editor`.
3. Ejecuta el contenido de [supabase-schema.sql](C:/Users/GZ%20White/Desktop/backend-reportes-main/supabase-schema.sql).
4. Ve a `Project Settings > API`.
5. Copia `Project URL` y `service_role key`.
6. Crea tu archivo `.env` basandote en `.env.example`.
7. Inicia el backend con `npm start`.

## Variables necesarias

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
SUPABASE_STORAGE_BUCKET=report-images
PORT=3001
```

## Estructura nueva

- `images`: imagenes sueltas del tablero actual.
- `sessions`: sesiones guardadas por nombre.
- `session_images`: snapshot de imagenes por sesion.
- `Storage bucket`: archivos reales de imagen.

## Nota importante

El frontend actual sigue enviando y recibiendo `imageData` en base64 para no romper la app. Internamente, el backend ya guarda los archivos en Supabase Storage.
