# Fixes completados ✅

## Resumen:
1. **server.js**: ✅ `getStorageUsageSnapshot()` ahora usa simple root-list + DB fallback (sin recursión profunda que causaba 502).
2. **docs/script.js**: ✅ `fetchStorageUsage()` maneja 5xx graceful + muestra info de fallback/estimated.

## Para testear:
```
cd "c:/Users/GZ White/Desktop/backend-reportes-main"
node server.js
```
- Abre http://localhost:3001
- Storage card debe aparecer sin errores (o con "estimado" si fallback).
- Console sin "No se pudo consultar el uso del bucket".

**Error 502 solucionado. Backend estable.**


