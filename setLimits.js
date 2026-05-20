/**
 * setLimits.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Llama a setLimit() en el contrato InvoiceSystem usando tu llave privada.
 *
 * INSTALACIÓN:
 *   npm install ethers dotenv
 *
 * FORMATO DEL ARCHIVO TXT (tablas.txt):
 *   # Líneas que empiezan con # son comentarios (ignoradas)
 *   # formato: NombreTabla , limit , perInvoiceLimit
 *   Espada_Comun,10000,500
 *   Escudo_Raro,5000,250
 *   Pocion_Vida,50000,1000
 *
 * USO:
 *   # Procesar TODAS las tablas del archivo:
 *   node setLimits.js --file tablas.txt
 *
 *   # Procesar SOLO UNA tabla específica:
 *   node setLimits.js --file tablas.txt --tipo Espada_Comun
 *
 *   # Ver qué haría SIN enviar transacciones (dry run):
 *   node setLimits.js --file tablas.txt --dry
 *   node setLimits.js --file tablas.txt --tipo Espada_Comun --dry
 *
 * VARIABLES DE ENTORNO (crear archivo .env o exportar):
 *   PRIVATE_KEY=0xTuLlavePrivadaDeMetaMask
 *   RPC_URL=https://mainnet.infura.io/v3/TU_API_KEY
 *   CONTRACT_ADDRESS=0xDireccionDelContrato
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const ethers  = require('ethers');
require('dotenv').config();

// ── ABI mínima: solo las funciones que usamos ─────────────────────────────────
const ABI = [
  "function setLimit(string calldata _tipo, uint256 _limit, uint256 _perInvoiceLimit) external",
  "function getTipoStats(string calldata _tipo) external view returns (uint256 totalQuantity, uint256 limit, uint256 perInvoiceLimit, uint256 invoiceCount, uint256 totalBurned, bool exists)",
  "event TipoLimitSet(string tipo, uint256 limit, uint256 perInvoiceLimit)"
];

// ── Colores para consola ──────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

function log(color, prefix, msg) {
  console.log(`${color}${c.bold}${prefix}${c.reset} ${msg}`);
}

// ── Parsear argumentos de línea de comandos ───────────────────────────────────
function parseArgs() {
  const args  = process.argv.slice(2);
  const result = { file: null, tipo: null, dry: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file'  && args[i + 1]) { result.file = args[++i]; continue; }
    if (args[i] === '--tipo'  && args[i + 1]) { result.tipo = args[++i]; continue; }
    if (args[i] === '--dry')                   { result.dry  = true;       continue; }
  }

  if (!result.file) {
    console.error(`${c.red}${c.bold}ERROR:${c.reset} Debes indicar el archivo con --file tablas.txt`);
    console.error(`${c.gray}Uso: node setLimits.js --file tablas.txt [--tipo NombreTabla] [--dry]${c.reset}`);
    process.exit(1);
  }

  return result;
}

// ── Parsear el archivo TXT ────────────────────────────────────────────────────
/**
 * Formato por línea:  NombreTabla,limit,perInvoiceLimit
 * Reglas:
 *   - Líneas vacías → ignoradas
 *   - Líneas que empiezan con # → comentarios, ignoradas
 *   - Espacios alrededor de comas → permitidos
 *   - limit y perInvoiceLimit deben ser enteros positivos > 0
 */
function parseTxt(filePath) {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    console.error(`${c.red}${c.bold}ERROR:${c.reset} Archivo no encontrado: ${absPath}`);
    process.exit(1);
  }

  const lines   = fs.readFileSync(absPath, 'utf8').split('\n');
  const entries = [];
  const errors  = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const parts = line.split(',').map(p => p.trim());

    if (parts.length !== 3) {
      errors.push(`Línea ${idx + 1}: formato incorrecto → "${line}" (esperado: tipo,limit,perInvoiceLimit)`);
      return;
    }

    const [tipo, limitStr, perInvoiceLimitStr] = parts;

    if (!tipo) {
      errors.push(`Línea ${idx + 1}: el nombre de la tabla está vacío`);
      return;
    }
    if (tipo.length > 64) {
      errors.push(`Línea ${idx + 1}: nombre demasiado largo (máx 64 chars) → "${tipo}"`);
      return;
    }

    const limit          = BigInt(limitStr);
    const perInvoiceLimit = BigInt(perInvoiceLimitStr);

    if (limit <= 0n) {
      errors.push(`Línea ${idx + 1}: limit debe ser > 0 → "${limitStr}"`);
      return;
    }
    if (perInvoiceLimit <= 0n) {
      errors.push(`Línea ${idx + 1}: perInvoiceLimit debe ser > 0 → "${perInvoiceLimitStr}"`);
      return;
    }

    entries.push({ tipo, limit, perInvoiceLimit, lineNum: idx + 1 });
  });

  if (errors.length) {
    console.error(`\n${c.red}${c.bold}Errores en el archivo TXT:${c.reset}`);
    errors.forEach(e => console.error(`  ${c.red}✗${c.reset} ${e}`));
    console.error('');
    process.exit(1);
  }

  return entries;
}

// ── Formatear número grande con separadores ───────────────────────────────────
function fmtBig(n) {
  return n.toLocaleString('en-US');
}

// ── Función principal ─────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  // ── 1. Variables de entorno ────────────────────────────────────────────────
  const PRIVATE_KEY        = process.env.PRIVATE_KEY;
  const RPC_URL            = process.env.RPC_URL;
  const CONTRACT_ADDRESS   = process.env.CONTRACT_ADDRESS;

  if (!PRIVATE_KEY) {
    console.error(`${c.red}${c.bold}ERROR:${c.reset} PRIVATE_KEY no definida en .env`);
    process.exit(1);
  }
  if (!RPC_URL) {
    console.error(`${c.red}${c.bold}ERROR:${c.reset} RPC_URL no definida en .env`);
    process.exit(1);
  }
  if (!CONTRACT_ADDRESS) {
    console.error(`${c.red}${c.bold}ERROR:${c.reset} CONTRACT_ADDRESS no definida en .env`);
    process.exit(1);
  }

  // ── 2. Conectar provider + wallet ─────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  // Info de red y wallet
  const network     = await provider.getNetwork();
  const walletAddr  = wallet.address;
  const balance     = await provider.getBalance(walletAddr);

  console.log('');
  console.log(`${c.cyan}${c.bold}═══════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.cyan}${c.bold}  InvoiceSystem — setLimit batch tool${c.reset}`);
  console.log(`${c.cyan}${c.bold}═══════════════════════════════════════════════════${c.reset}`);
  console.log(`  Red:       ${network.name} (chainId ${network.chainId})`);
  console.log(`  Wallet:    ${walletAddr}`);
  console.log(`  Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log(`  Contrato:  ${CONTRACT_ADDRESS}`);
  if (args.dry) {
    console.log(`  ${c.yellow}${c.bold}MODO DRY-RUN — no se enviarán transacciones${c.reset}`);
  }
  console.log('');

  // ── 3. Parsear archivo ────────────────────────────────────────────────────
  let entries = parseTxt(args.file);

  // ── 4. Filtrar si se especificó --tipo ────────────────────────────────────
  if (args.tipo) {
    const original = entries.length;
    entries = entries.filter(e => e.tipo === args.tipo);

    if (entries.length === 0) {
      console.error(`${c.red}${c.bold}ERROR:${c.reset} Tabla "${args.tipo}" no encontrada en ${args.file}`);
      console.error(`${c.gray}Tablas disponibles: ${parseTxt(args.file).map(e => e.tipo).join(', ')}${c.reset}`);
      process.exit(1);
    }

    log(c.yellow, '[FILTRO]', `Solo procesando "${args.tipo}" (${entries.length} de ${original} tablas)`);
  } else {
    log(c.cyan, '[INFO]', `${entries.length} tabla(s) encontrada(s) en ${args.file}`);
  }

  console.log('');

  // ── 5. Mostrar tabla de lo que se va a hacer ──────────────────────────────
  console.log(`${c.bold}  Tabla                           limit            perInvoiceLimit${c.reset}`);
  console.log(`  ${'─'.repeat(65)}`);
  entries.forEach(e => {
    const tipo  = e.tipo.padEnd(32);
    const lim   = fmtBig(e.limit).padStart(16);
    const pil   = fmtBig(e.perInvoiceLimit).padStart(16);
    console.log(`  ${c.cyan}${tipo}${c.reset}${lim}    ${lim !== pil ? pil : pil}`);
  });
  console.log('');

  if (args.dry) {
    log(c.yellow, '[DRY-RUN]', 'Simulación completa. Sin errores de formato. No se envió nada.');
    return;
  }

  // ── 6. Confirmar antes de proceder ────────────────────────────────────────
  // (Si corres en CI/automatizado puedes quitar este bloque)
  await confirmPrompt(`¿Confirmas enviar ${entries.length} transacción(es)? (s/N): `);

  // ── 7. Enviar transacciones ───────────────────────────────────────────────
  let ok = 0, fail = 0;

  for (const entry of entries) {
    const { tipo, limit, perInvoiceLimit, lineNum } = entry;
    process.stdout.write(`  ${c.cyan}→${c.reset} ${tipo.padEnd(34)} ... `);

    try {
      const tx      = await contract.setLimit(tipo, limit, perInvoiceLimit);
      process.stdout.write(`${c.gray}tx ${tx.hash.slice(0, 14)}...${c.reset} `);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        process.stdout.write(`${c.green}✓ OK${c.reset} (gas: ${receipt.gasUsed.toLocaleString()})\n`);
        ok++;
      } else {
        process.stdout.write(`${c.red}✗ REVERTIDA${c.reset}\n`);
        fail++;
      }
    } catch (err) {
      const reason = extractRevertReason(err);
      process.stdout.write(`${c.red}✗ ERROR: ${reason}${c.reset}\n`);
      fail++;
    }
  }

  // ── 8. Resumen ────────────────────────────────────────────────────────────
  console.log('');
  console.log(`${c.cyan}${c.bold}═══════════════════════════════════════════════════${c.reset}`);
  console.log(`  Resultado: ${c.green}${c.bold}${ok} exitosas${c.reset}  ${fail > 0 ? `${c.red}${c.bold}${fail} fallidas${c.reset}` : `${c.gray}0 fallidas${c.reset}`}`);
  console.log(`${c.cyan}${c.bold}═══════════════════════════════════════════════════${c.reset}`);
  console.log('');

  if (fail > 0) process.exit(1);
}

// ── Helper: extraer razón de revert legible ───────────────────────────────────
function extractRevertReason(err) {
  if (err?.reason)              return err.reason;
  if (err?.data?.message)       return err.data.message;
  if (err?.shortMessage)        return err.shortMessage;
  const m = err?.message || '';
  const match = m.match(/reason="([^"]+)"/);
  if (match) return match[1];
  if (m.length > 120) return m.slice(0, 120) + '…';
  return m || 'desconocido';
}

// ── Helper: confirmación por teclado ─────────────────────────────────────────
function confirmPrompt(question) {
  return new Promise((resolve, reject) => {
    const rl = require('readline').createInterface({
      input:  process.stdin,
      output: process.stdout,
    });
    rl.question(`${c.yellow}${c.bold}  ⚡ ${question}${c.reset}`, answer => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 's' || a === 'si' || a === 'y' || a === 'yes') {
        resolve();
      } else {
        console.log(`${c.gray}  Cancelado.${c.reset}\n`);
        process.exit(0);
      }
    });
  });
}

main().catch(err => {
  console.error(`\n${c.red}${c.bold}Error fatal:${c.reset}`, err.message || err);
  process.exit(1);
});
