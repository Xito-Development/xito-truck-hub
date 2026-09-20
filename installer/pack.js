// Une el instalador con interfaz propia (stub) y el instalador real en un solo archivo
const fs = require('fs');
const path = require('path');
const MAGIC = Buffer.from('XITOPKG1', 'ascii');
const [stub, inner, out] = process.argv.slice(2);
if (!stub || !inner || !out) { console.error('Uso: node pack.js <stub.exe> <inner.exe> <salida.exe>'); process.exit(1); }
const a = fs.readFileSync(stub), b = fs.readFileSync(inner);
const len = Buffer.alloc(8); len.writeBigInt64LE(BigInt(b.length));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([a, b, len, MAGIC]));
console.log(`${path.basename(out)} · ${(fs.statSync(out).size / 1048576).toFixed(1)} MB (interfaz ${(a.length / 1024).toFixed(0)} KB + instalador ${(b.length / 1048576).toFixed(1)} MB)`);
