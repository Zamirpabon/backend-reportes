# Backend Reportes

Aplicacion de reportes fotograficos con:

- Frontend estatico servido desde `docs/`
- Backend Express en `server.js`
- Base de datos y storage en Supabase

## Correr local

1. Crea `.env` con las variables de Supabase.
2. Instala dependencias:

npm install
```

3. Inicia la app:

```powershell
npm start
```

4. Abre:

```text
http://localhost:3001
```

## Variables necesarias

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
SUPABASE_STORAGE_BUCKET=report-images
SUPABASE_STORAGE_LIMIT_BYTES=1073741824
MAX_IMAGE_BYTES=8388608
PORT=3001
```

## Deploy en Render

Este repo ya incluye `render.yaml`.

1. Sube el repo a Git.
2. Crea un nuevo servicio web en Render conectado a ese repo.
3. Render tomara:
   - `buildCommand: npm install`
   - `startCommand: npm start`
4. Agrega en Render estas variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET`
   - `SUPABASE_STORAGE_LIMIT_BYTES`
   - `MAX_IMAGE_BYTES`
   - `PORT`

## Importante

- El frontend y el backend quedan servidos por el mismo servidor.
- Para desarrollo local no uses Live Server; usa `http://localhost:3001`.
- Para produccion, el frontend usara el mismo dominio del backend desplegado.
