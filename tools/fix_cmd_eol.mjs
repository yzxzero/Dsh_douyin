// 把 .cmd / .bat 文件统一改成 CRLF 换行（Windows cmd.exe 必需），
// 顺带保留 UTF-8 编码。用法: node tools/fix_cmd_eol.mjs <file...>
import { readFileSync, writeFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('用法: node tools/fix_cmd_eol.mjs <file...>');
  process.exit(1);
}

for (const f of files) {
  const buf = readFileSync(f);
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const before = (text.match(/\r\n/g) || []).length;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  writeFileSync(f, Buffer.from(normalized, 'utf8'));
  const after = (normalized.match(/\r\n/g) || []).length;
  console.log(`${f}: CRLF ${before} -> ${after}`);
}
