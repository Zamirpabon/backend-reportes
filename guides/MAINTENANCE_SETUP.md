# Configuración de Mantenimiento y Heartbeat para Supabase Free

## Problema Resuelto

Supabase pausas los proyectos Free después de inactividad. Este sistema de mantenimiento evita eso mediante un **heartbeat periódico combinado con tareas útiles de limpieza**.

## Endpoint de Mantenimiento

### Ruta

```
GET /maintenance?key=YOUR_MAINTENANCE_KEY
POST /maintenance?key=YOUR_MAINTENANCE_KEY
```

### Autenticación

La clave de mantenimiento se configura mediante la variable de entorno:

```bash
MAINTENANCE_KEY=your-secure-key-here
```

Si no se define, usa un valor por defecto `maintenance-key-change-me` (cámbialo en producción).

### Respuesta

```json
{
  "success": true,
  "timestamp": "2026-04-22T18:15:30.000Z",
  "durationMs": 1245,
  "tasks": {
    "cleanupExpiredLoose": {
      "success": true,
      "processedCount": 0,
      "reason": "Limpieza de imágenes con más de 72 horas"
    },
    "cleanupOrphanedSessions": {
      "success": true,
      "foundCount": 0,
      "deletedCount": 0,
      "errorCount": 0,
      "errors": []
    },
    "storageUsage": {
      "success": true,
      "filesCount": 42,
      "usedBytes": 156843,
      "limitBytes": 1073741824,
      "usagePercent": 0.015
    },
    "heartbeat": {
      "success": true,
      "timestamp": "2026-04-22T18:15:30.000Z"
    }
  }
}
```

## Qué Hace Cada Tarea

| Tarea | Descripción |
|-------|-------------|
| `cleanupExpiredLoose` | Elimina imágenes sin sesión que tengan más de 72 horas |
| `cleanupOrphanedSessions` | Busca y elimina sesiones que no tienen imágenes actuales |
| `storageUsage` | Verifica el uso de almacenamiento (consulta real a Supabase) |
| `heartbeat` | Simple query verification a la tabla `sessions` |

## Configuración con Cron Externo (Recomendado)

### Opción 1: cron-job.org (Más Simple) ⭐ Recomendado

1. **Registrarse en [cron-job.org](https://cron-job.org)** (gratis)

2. **Crear un nuevo Cron Job:**
   - **Title:** `backend-reportes-maintenance`
   - **URL:** `https://your-domain.com/maintenance?key=YOUR_MAINTENANCE_KEY`
   - **Execution time:** Seleccionar intervalo
     - Cada **30 minutos**: `*/30 * * * *`
     - Cada **60 minutos**: `0 * * * *` (recomendado)
     - Cada **15 minutos**: `*/15 * * * *`
   - **Save responses** (activar para ver logs)

3. **Listo.** El servicio hará ping automáticamente.

### Opción 2: GitHub Actions (Más "Prolijito")

1. **Crear archivo** `.github/workflows/maintenance.yml`:

```yaml
name: Supabase Maintenance

on:
  schedule:
    # Todos los días cada hora
    - cron: '0 * * * *'

jobs:
  maintenance:
    runs-on: ubuntu-latest
    steps:
      - name: Run maintenance tasks
        run: |
          curl -X GET "${{ secrets.BACKEND_URL }}/maintenance?key=${{ secrets.MAINTENANCE_KEY }}" \
            -H "Content-Type: application/json" \
            -w "\n[Status: %{http_code}]\n"
```

2. **Agregar Secrets en repo:**
   - `BACKEND_URL`: tu URL de backend (ej: `https://backend-reportes.vercel.app`)
   - `MAINTENANCE_KEY`: la clave definida en `MAINTENANCE_KEY`

3. **Hacer push** y GitHub Actions ejecutará automáticamente.

### Opción 3: UptimeRobot (Monitoreo + Cron)

1. **Registrarse en [UptimeRobot](https://uptimerobot.com)** (gratis)

2. **Crear Monitor:**
   - **Monitor type:** HTTP(s)
   - **Friendly Name:** `backend-reportes maintenance`
   - **URL:** `https://your-domain.com/maintenance?key=YOUR_MAINTENANCE_KEY`
   - **Monitoring Interval:** 5 minutos (mínimo en plan free)
   - **Alert contacts:** (opcional)

3. **Listo.** Además de monitorear, ejecutará el endpoint cada 5 minutos.

## Configuración en Variables de Entorno

### `.env` Local

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
MAINTENANCE_KEY=your-super-secret-key-here
PORT=3001
```

### En Render/Vercel

1. Ir a **Settings → Environment Variables**
2. Agregar:
   - `MAINTENANCE_KEY=your-super-secret-key-here`

## Logs y Monitoreo

### Ver Logs Locales

```bash
npm start
# Verás líneas como:
# [backend-reportes] Iniciando tarea de mantenimiento: limpieza de imágenes temporales...
# [backend-reportes] Ciclo de mantenimiento completado
```

### En Render

1. Ir a **Logs** en dashboard
2. Filtrar por `Ciclo de mantenimiento` o `maintenance`

### En cron-job.org

1. Dashboard → Click en el job
2. Ver **Execution log** con timestamps y respuestas HTTP

## Recomendaciones

### Frecuencia Sugerida

| Escenario | Intervalo | Razón |
|-----------|-----------|-------|
| **Desarrollo local** | No necesario | Server siempre corre |
| **En producción (Free Tier)** | **30-60 min** | Previene pausas, no sobre-consulta |
| **Monitoreo + mantenimiento** | **15-20 min** | Asegura actividad constante |

### Validar que Funciona

```bash
# Local
curl "http://localhost:3001/maintenance?key=your-super-secret-key-here"

# Producción (ejemplo)
curl "https://backend-reportes.yoursite.com/maintenance?key=your-super-secret-key-here"
```

**Expected:** HTTP 200 con JSON de tareas.

### Seguridad

1. **Nunca** compartas tu `MAINTENANCE_KEY` públicamente
2. **Usa valores fuertes** (ej: genera una con `openssl rand -base64 32`)
3. **Rota la clave** si crees que fue expuesta
4. En **GitHub Actions**, usa **Secrets** (nunca hardcode)

## Troubleshooting

| Problema | Solución |
|----------|----------|
| `401 Unauthorized` | Verifica que `MAINTENANCE_KEY` en `.env` sea igual a la del cron |
| `404 Not Found` | Asegúrate que el URL es correcto (ej: no falta el dominio) |
| Las tareas fallan | Revisa los **Logs** en Render/Vercel |
| No se ejecuta el cron | Verifica que cron-job.org/GitHub tenga acceso a tu URL |

## Monitoreo Recomendado

Además del cron de mantenimiento, configura:

1. **UptimeRobot** para alertas si el servidor cae
2. **Logs** en Render/Vercel para auditar limpieza
3. **Métricas de storage** (`/usage`) para evitar saturación

## Próximos Pasos

1. **Definir** `MAINTENANCE_KEY` seguro en `.env`
2. **Elegir** cron externo (recomendado: cron-job.org)
3. **Crear** el cron y validar con un test manual
4. **Monitorear** en los primeros días
5. **Ajustar frecuencia** si es necesario

---

**Nota:** Esta estrategia no garantiza 100% que Supabase nunca pause el proyecto Free, pero es altamente probable que funcione basándose en el patrón observado en Zamge.
