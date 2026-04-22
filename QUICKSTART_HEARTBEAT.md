# ⚡ Quick Start: Activar Heartbeat en 5 minutos

## Paso 1: Copiar Cambios al Servidor (Ya Hecho ✓)

El endpoint `/maintenance` ya está implementado en `server.js`.

## Paso 2: Generar Clave Segura

```bash
# Opción A: En terminal (Linux/Mac/WSL)
openssl rand -base64 32

# Opción B: En PowerShell (Windows)
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))

# Opción C: Online (NO RECOMENDADO para producción, solo test)
# https://www.random.org/cgi-bin/randbytes?nbytes=32&format=h
```

**Salida esperada:**
```
Q7mK9xL2pXvQ8wN3jB1yZ6aM5cD4eF0gH7iJ9kL2mN=
```

## Paso 3: Agregar a Variables de Entorno

### Opción A: Local (`.env`)
```bash
MAINTENANCE_KEY=Q7mK9xL2pXvQ8wN3jB1yZ6aM5cD4eF0gH7iJ9kL2mN=
```

### Opción B: En Render
1. Dashboard → **Settings** → **Environment**
2. **Add Variable:**
   - Key: `MAINTENANCE_KEY`
   - Value: `Q7mK9xL2pXvQ8wN3jB1yZ6aM5cD4eF0gH7iJ9kL2mN=`
3. **Save** y redeploy automáticamente

### Opción C: En Vercel
1. Settings → **Environment Variables**
2. Add:
   - Name: `MAINTENANCE_KEY`
   - Value: `Q7mK9xL2pXvQ8wN3jB1yZ6aM5cD4eF0gH7iJ9kL2mN=`
3. **Production** + **Save**

## Paso 4: Validar Localmente

```bash
# Terminal 1: Iniciar
npm start

# Terminal 2: Test
curl "http://localhost:3001/maintenance?key=Q7mK9xL2pXvQ8wN3jB1yZ6aM5cD4eF0gH7iJ9kL2mN="

# Debería responder con HTTP 200 y JSON
```

## Paso 5: Crear Cron (cron-job.org)

### 5a. Registrarse
1. Ir a https://cron-job.org
2. **Sign in** o **Create account** (gratis)

### 5b. Crear Cronjob

Llena el formulario:

| Campo | Valor |
|-------|-------|
| **Title** | `backend-reportes-maintenance` |
| **URL** | `https://your-backend.com/maintenance?key=Q7mK9xL2pXvQ8wN3jB1yZ6aM5cD4eF0gH7iJ9kL2mN=` |
| **Execution time** | `0 * * * *` (cada hora) o `*/30 * * * *` (cada 30 min) |
| **Save response** | ✅ Activar |

### 5c. Guardar y Listo

```
✓ Job ID: 12345678
✓ Status: IDLE
✓ Next execution: 2026-04-22 20:00:00 UTC
```

---

## ✅ Verificar que Funciona

### Método 1: Manual Test
```bash
curl -v "https://your-backend.com/maintenance?key=YOUR_KEY"
# HTTP/1.1 200 OK
# {
#   "success": true,
#   "durationMs": 1200,
#   "tasks": {...}
# }
```

### Método 2: Ver en cron-job.org
1. Dashboard → Clicx en el job
2. **Execution log** mostrará:
   - ✓ HTTP 200
   - Timestamps
   - Response content

### Método 3: Ver en logs del servidor
```bash
# En Render logs
# [backend-reportes] Ciclo de mantenimiento completado
# [backend-reportes] GET /maintenance 200
```

---

## 🎯 Confirmación Final

❌ **NO funciona si:**
- `curl` retorna `401 Unauthorized` → Clave incorrecta
- `curl` retorna `404 Not Found` → URL incorrecta
- Backend responde pero sin cambios de storage → Verifica DB

✅ **SÍ funciona si:**
- HTTP 200 con JSON response
- Ver `"success": true`
- Logs muestran `Ciclo de mantenimiento completado`

---

## 📞 Próximos Pasos (Opcional)

1. **Validar por 24-48 horas** que logs aparezcan regularmente
2. **Cambiar frecuencia** si es necesario:
   - `0 * * * *` = cada hora
   - `*/30 * * * *` = cada 30 minutos
   - `*/15 * * * *` = cada 15 minutos
3. **Agregar monitoreo** con UptimeRobot para alertas

---

## 🆘 Problemas Rápidos

**"401 Unauthorized"**
→ Clave no coincide entre cron-job.org y `MAINTENANCE_KEY` en Render/`.env`

**"Connection timeout"**
→ Tu server no es accesible desde internet, verifica URL

**"Tasks se ejecutan pero lentas"**
→ Normal, puede tomar 1-2 segundos, especialmente `storageUsage`

**"No puedo generar clave segura"**
→ Use sitio online como generador temporal, pero REEMPLAZA en producción

---

## 📚 Documentos de Referencia

- **Detalles técnicos:** [MAINTENANCE_SETUP.md](./MAINTENANCE_SETUP.md)
- **Arquitectura visual:** [HEARTBEAT_ARCHITECTURE.md](./HEARTBEAT_ARCHITECTURE.md)
- **Código:** [server.js](./server.js) líneas ~730-900

---

**¡Listo! Tu backend ahora tiene heartbeat automático. Supabase Free nunca debería pausarse.** 🚀
