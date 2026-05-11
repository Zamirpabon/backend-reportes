# 🏗️ Arquitectura de Heartbeat - Backend Reportes

## Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE FREE (PROYECTO)                  │
│  ⚠️ Se pausa después de 7 días sin actividad                │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ Consultas periódicas
                              │ Actividad = NO PAUSE
                              │
                ┌─────────────┴──────────────┐
                │                            │
        ┌───────┴─────────┐        ┌────────┴────────┐
        │  INTERNAL TASK  │        │  EXTERNAL CRON  │
        │  (setInterval)  │        │ (cron-job.org)  │
        └───────┬─────────┘        └────────┬────────┘
                │                           │
                │ Cada 1 hora               │ Cada 30-60 min
                │                           │
                └─────────────┬─────────────┘
                              │
                ┌─────────────▼──────────────────────┐
                │  GET /maintenance?key=SECRET       │
                │  ┌──────────────────────────────┐  │
                │  │ 1. Cleanup Expired Images    │  │
                │  │ 2. Delete Orphaned Sessions  │  │
                │  │ 3. Get Storage Usage Snapshot│  │
                │  │ 4. Heartbeat Query           │  │
                │  └──────────────────────────────┘  │
                └─────────────┬──────────────────────┘
                              │
                              ▼
                    JSON Response + Logs
```

## Componentes

### 1️⃣ INTERNAL SCHEDULER (Ya existía)
- **Qué:** `setInterval` en `server.js`
- **Frecuencia:** 1 hora (configurable via `CLEANUP_INTERVAL_MS`)
- **Acción:** `cleanupRecebedLooseImages()` solamente
- **Propósito:** Limpieza automática

### 2️⃣ MAINTENANCE ENDPOINT (Nuevo)
```
GET  /maintenance?key=YOUR_KEY
POST /maintenance?key=YOUR_KEY
```

**Protección:** Requiere `MAINTENANCE_KEY` (variable de entorno)

**Tareas ejecutadas:**

| Tarea | Descripción | Importancia |
|-------|-------------|------------|
| `cleanupExpiredLoose` | Borra imágenes > 72h sin sesión | ♻️ Mantenimiento |
| `cleanupOrphanedSessions` | Borra sesiones huérfanas | ♻️ Mantenimiento |
| `storageUsage` | Lee snapshot de storage | 🔍 Verificación |
| `heartbeat` | Query simple a tabla sessions | 💓 Heartbeat |

### 3️⃣ EXTERNAL CRON (A Configurar)

**Opciones gratuitas:**
- ✅ **cron-job.org** (Recomendado - más simple)
- ✅ **GitHub Actions** (Requiere repo público o privado con 2000 min/mes)
- ✅ **UptimeRobot** (Monitoreo + cron)

**Frecuencia sugerida:** 30-60 minutos

**Ejemplo cron-job.org:**
```
URL: https://backend-reportes.yoursite.com/maintenance?key=YOUR_SECRET_KEY
Schedule: 0 * * * * (cada hora, o */30 * * * * cada 30 min)
```

---

## Configuración Paso a Paso

### 📝 1. Agregar Variable de Entorno

**Archivo `.env`:**
```bash
MAINTENANCE_KEY=super-secret-key-change-this-in-production
```

**Generar clave segura:**
```bash
# En terminal
openssl rand -base64 32
# Salida: Q7mK9xL2pXvQ8wN3jB1yZ6aM5cD4eF0gH7iJ9kL2mN...
```

### 🧪 2. Validar Localmente

```bash
# Terminal 1: Iniciar backend
npm start

# Terminal 2: Test del endpoint
curl "http://localhost:3001/maintenance?key=super-secret-key-change-this-in-production"

# Expected (HTTP 200):
# {
#   "success": true,
#   "timestamp": "2026-04-22T18:15:30.000Z",
#   "durationMs": 1245,
#   "tasks": { ... }
# }
```

### 🌐 3. Configurar en Producción (Render/Vercel)

**Render:**
1. Dashboard → Environment
2. Add Variable:
   - **Key:** `MAINTENANCE_KEY`
   - **Value:** (tu clave segura generada)
3. Deploy automáticamente

**Vercel:**
1. Settings → Environment Variables
2. Add:
   - **Name:** `MAINTENANCE_KEY`
   - **Value:** (tu clave segura)
3. Redeploy

### ⏱️ 4. Configurar Cron Externo

**cron-job.org (Recomendado):**

1. Ir a [cron-job.org](https://cron-job.org)
2. Sign in / Create account (gratis)
3. **Create Cronjob:**
   - **Title:** `backend-reportes-maintenance`
   - **URL:** `https://backend-reportes.yourdomain.com/maintenance?key=YOUR_SECRET_KEY`
   - **Execution time:** `0 * * * *` (cada hora)
   - **Save response:** ✅ (para logs)
4. **Save** ✓

**GitHub Actions (Alternativa):**

1. Crear `.github/workflows/maintenance.yml`
2. Agregar SECRETS en repo
3. Commit/Push

---

## 📊 Efecto Esperado

**Antes (Sin heartbeat):**
```
Day 0   🟢 Activo
Day 1   🟢 Activo  
Day 2   🟢 Activo
Day 3   🟢 Activo
Day 4   🟢 Activo
Day 5   🟢 Activo
Day 6   🟢 Activo
Day 7   🔴 PAUSADO ← Supabase pausó por inactividad
```

**Después (Con heartbeat cada 30-60 min):**
```
Day 0   🟢 Activo (últimas queries: frontend + mantenimiento)
Day 1   🟢 Activo (mantenimiento cada hora = actividad detectable)
Day 2   🟢 Activo
...
Day ∞   🟢 Activo (nunca alcanza 7 días sin actividad)
```

---

## 🔐 Seguridad

| Aspecto | Protección |
|--------|-----------|
| **Acceso al endpoint** | Solo con `MAINTENANCE_KEY` válida |
| **Query parameter** | Visible en logs, o en body en POST |
| **Ambientes** | Usar secrets en Render/Vercel (no hardcode) |
| **Rotación** | Cambiar `MAINTENANCE_KEY` si se expone |

---

## 📈 Monitoreo

### Ver Logs Locales
```bash
npm start
# Buscar: "Ciclo de mantenimiento completado"
```

### En Render
- Dashboard → Logs
- Filtrar: `Ciclo de mantenimiento`

### En cron-job.org
- Dashboard → Click job
- **Execution log** con timestamps

### Validar que Corre
```bash
# Si ves respuestas 200 con timestamps crecientes = ✅ Funciona
```

---

## ⚡ ProTips

1. **Frecuencia:** 30 minutos es suficiente. 60 minutos es más económico en API calls.
2. **Testing:** Configura cron-job.org primero **localmente** (ngrok o similar) antes de producción.
3. **Logs:** Habilita `Save response` en cron-job.org para debugging.
4. **Backup:** El `setInterval` del server sigue funcionando como respaldo automático.
5. **Costo:** Cron externo gratis = sin costo adicional, solo actividad periódica.

---

## 🆘 Troubleshooting

| Error | Solución |
|-------|----------|
| `401 Unauthorized` | Verifica `MAINTENANCE_KEY` en endpoints vs `.env` |
| `404 Not Found` | Verifica URL completa (dominio + puerto + path) |
| Tasks fallan | Revisa logs de Render/Vercel para errores DB |
| Cron no ejecuta | Verifica que cron-job.org tiene **internet access** a tu URL |

---

## Next Steps ✅

1. ✓ Endpoint `/maintenance` implementado
2. → Agregar `MAINTENANCE_KEY` a `.env`
3. → Deployar cambios a Render/Vercel
4. → Crear cron en cron-job.org
5. → Validar que ejecuta correctamente
6. → Monitorear por 24-48 horas
7. → Olvidarse y dejar que corra 🎉
