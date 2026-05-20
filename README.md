# setLimits.js — Guía de uso

Herramienta para llamar `setLimit()` en el contrato **InvoiceSystem**
usando tu llave privada de MetaMask. Sin necesidad de abrir Remix ni ninguna UI.

---

## 1. Instalación

```bash
npm install ethers dotenv
```

---

## 2. Configurar credenciales

Copia `.env.example` a `.env` y rellena los 3 valores:

```bash
cp .env.example .env
```

```env
PRIVATE_KEY=0xTuLlavePrivadaDeMetaMask
RPC_URL=https://mainnet.infura.io/v3/TU_KEY
CONTRACT_ADDRESS=0xDireccionDelContrato
```

> ⚠️ **Nunca subas `.env` a git.** Agrega `.env` a tu `.gitignore`.

---

## 3. Formato del archivo TXT

Cada línea define una tabla:

```
NombreTabla , limit , perInvoiceLimit
```

| Campo            | Descripción                                               |
|------------------|-----------------------------------------------------------|
| `NombreTabla`    | El `_tipo` del contrato (string, máx 64 chars)           |
| `limit`          | Cantidad total máxima acumulada del tipo en el contrato  |
| `perInvoiceLimit`| Cantidad máxima que puede tener UNA sola factura          |

Ejemplo `tablas.txt`:
```
# Comentario — esta línea se ignora
Espada_Comun,10000,500
Pocion_Vida,50000,1000
Oro_Barra,10000,500
```

---

## 4. Comandos

### Procesar TODAS las tablas del archivo
```bash
node setLimits.js --file tablas.txt
```

### Procesar UNA tabla específica
```bash
node setLimits.js --file tablas.txt --tipo Espada_Comun
```

### Dry-run (ver qué haría SIN enviar nada)
```bash
# Todas las tablas:
node setLimits.js --file tablas.txt --dry

# Solo una tabla:
node setLimits.js --file tablas.txt --tipo Espada_Comun --dry
```

---

## 5. Flujo del script

```
1. Lee .env → PRIVATE_KEY, RPC_URL, CONTRACT_ADDRESS
2. Conecta a la red (ethers.JsonRpcProvider)
3. Crea wallet firmante con tu llave privada
4. Parsea tablas.txt (valida formato, detecta errores antes de gastar gas)
5. Si --tipo → filtra solo esa tabla
6. Si --dry  → muestra la tabla y termina (sin transacciones)
7. Pide confirmación por teclado (s/N)
8. Por cada tabla: llama setLimit(), espera recibo, muestra resultado
9. Resumen final: X exitosas / Y fallidas
```

---

## 6. Errores comunes del contrato

| Error del contrato       | Causa                                                        |
|--------------------------|--------------------------------------------------------------|
| `TipoLimitZero`          | `limit` es 0                                                 |
| `PerInvoiceLimitTooLow`  | `perInvoiceLimit` es 0                                       |
| `Unauthorized`           | Tu wallet no es el owner del contrato                        |

---

## 7. Seguridad

- La llave privada **solo vive en `.env`**, nunca sale en logs ni pantalla.
- El script pide confirmación explícita antes de enviar cualquier transacción.
- Usa `--dry` siempre primero para verificar antes de gastar gas.
