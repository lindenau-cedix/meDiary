import { inflateRawSync } from 'node:zlib';
import { normalizeDateTime, nowLocalISO } from './time.js';

const HEADERS = ['Zeitpunkt', 'Substanz', 'Menge', 'Notiz', 'Erstellt am'] as const;
const SHEET_NAME = 'Konsumvorgaenge';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface IntakeXlsxRow {
  takenAt: string;
  substanceName: string;
  amount: string | null;
  notes: string | null;
  createdAt: string;
}

export function buildIntakesWorkbook(rows: IntakeXlsxRow[]): Buffer {
  const table = [
    [...HEADERS],
    ...rows.map((r) => [r.takenAt, r.substanceName, r.amount ?? '', r.notes ?? '', r.createdAt]),
  ];

  return createZip([
    { name: '[Content_Types].xml', data: xmlContentTypes() },
    { name: '_rels/.rels', data: xmlRootRels() },
    { name: 'docProps/app.xml', data: xmlAppProps() },
    { name: 'docProps/core.xml', data: xmlCoreProps() },
    { name: 'xl/workbook.xml', data: xmlWorkbook() },
    { name: 'xl/_rels/workbook.xml.rels', data: xmlWorkbookRels() },
    { name: 'xl/styles.xml', data: xmlStyles() },
    { name: 'xl/worksheets/sheet1.xml', data: xmlWorksheet(table) },
  ]);
}

export function parseIntakesWorkbook(buffer: Buffer): IntakeXlsxRow[] {
  const entries = readZip(buffer);
  const workbookPath = entries.has('xl/workbook.xml') ? 'xl/workbook.xml' : findEntry(entries, /\/?workbook\.xml$/);
  if (!workbookPath) throw new Error('Keine XLSX-Arbeitsmappe gefunden.');

  const sheetPath = resolveFirstSheetPath(entries, workbookPath);
  const sheetXml = getTextEntry(entries, sheetPath);
  const sharedStrings = parseSharedStrings(entries);
  const rows = parseSheetRows(sheetXml, sharedStrings);
  const headerIndex = rows.findIndex((r) => r.some((c) => c.trim() !== ''));
  if (headerIndex < 0) throw new Error('Die XLSX-Datei enthält keine Tabelle.');

  const keys = rows[headerIndex].map(headerKey);
  const cols = {
    takenAt: keys.findIndex((k) => k === 'takenAt'),
    substanceName: keys.findIndex((k) => k === 'substanceName'),
    amount: keys.findIndex((k) => k === 'amount'),
    notes: keys.findIndex((k) => k === 'notes'),
    createdAt: keys.findIndex((k) => k === 'createdAt'),
  };
  if (cols.takenAt < 0 || cols.substanceName < 0) {
    throw new Error('Die XLSX-Datei braucht mindestens die Spalten "Zeitpunkt" und "Substanz".');
  }

  const now = nowLocalISO();
  const parsed: IntakeXlsxRow[] = [];
  const errors: string[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some((c) => c.trim() !== '')) continue;

    const line = i + 1;
    const substanceName = cell(row, cols.substanceName).trim();
    const takenAtRaw = cell(row, cols.takenAt).trim();
    if (!substanceName) errors.push(`Zeile ${line}: Substanz fehlt`);
    if (!takenAtRaw) errors.push(`Zeile ${line}: Zeitpunkt fehlt`);
    if (!substanceName || !takenAtRaw) continue;

    try {
      parsed.push({
        takenAt: normalizeImportedDateTime(takenAtRaw),
        substanceName,
        amount: nullableCell(row, cols.amount),
        notes: nullableCell(row, cols.notes),
        createdAt: nullableCell(row, cols.createdAt)
          ? normalizeImportedDateTime(cell(row, cols.createdAt))
          : now,
      });
    } catch (e) {
      errors.push(`Zeile ${line}: ${(e as Error).message}`);
    }
  }

  if (errors.length) {
    const suffix = errors.length > 6 ? ` (${errors.length - 6} weitere Fehler)` : '';
    throw new Error(`${errors.slice(0, 6).join('; ')}${suffix}`);
  }
  return parsed;
}

function cell(row: string[], index: number): string {
  return index >= 0 ? row[index] ?? '' : '';
}

function nullableCell(row: string[], index: number): string | null {
  const value = cell(row, index).trim();
  return value || null;
}

function normalizeImportedDateTime(input: string): string {
  const raw = input.trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return excelSerialToLocalISO(Number(raw));

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const [, y, m, d, h = '00', min = '00', s = '00'] = iso;
    return `${y}-${m}-${d}T${h.padStart(2, '0')}:${min}:${s.padStart(2, '0')}`;
  }

  const german = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[, ]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (german) {
    const [, d, m, y, h = '00', min = '00', s = '00'] = german;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:${s.padStart(2, '0')}`;
  }

  return normalizeDateTime(raw);
}

function excelSerialToLocalISO(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1) throw new Error(`Ungültiger Excel-Zeitwert: ${serial}`);
  const ms = Math.round((serial - 25569) * 86_400_000);
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

function headerKey(header: string): 'takenAt' | 'substanceName' | 'amount' | 'notes' | 'createdAt' | null {
  const key = header
    .trim()
    .toLocaleLowerCase('de')
    .replace(/[\s.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (['zeitpunkt', 'datum_zeit', 'datum_uhrzeit', 'taken_at', 'takenat'].includes(key)) return 'takenAt';
  if (['substanz', 'substanzname', 'substance', 'substance_name', 'substancename', 'name'].includes(key)) {
    return 'substanceName';
  }
  if (['menge', 'dosis', 'amount', 'dose'].includes(key)) return 'amount';
  if (['notiz', 'notizen', 'hinweis', 'notes', 'note'].includes(key)) return 'notes';
  if (['erstellt_am', 'erstellt', 'created_at', 'createdat'].includes(key)) return 'createdAt';
  return null;
}

function xmlWorksheet(rows: string[][]): string {
  const lastRow = Math.max(rows.length, 1);
  const lastCol = colName(Math.max(HEADERS.length, ...rows.map((r) => r.length)));
  const body = rows
    .map((row, r) => {
      const rowNumber = r + 1;
      const cells = row
        .map((value, c) => {
          const ref = `${colName(c + 1)}${rowNumber}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXmlText(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join('');

  return xmlDecl(`\
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCol}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="22" customWidth="1"/>
    <col min="2" max="2" width="24" customWidth="1"/>
    <col min="3" max="3" width="16" customWidth="1"/>
    <col min="4" max="4" width="42" customWidth="1"/>
    <col min="5" max="5" width="22" customWidth="1"/>
  </cols>
  <sheetData>${body}</sheetData>
</worksheet>`);
}

function xmlWorkbook(): string {
  return xmlDecl(`\
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${SHEET_NAME}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
}

function xmlWorkbookRels(): string {
  return xmlDecl(`\
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
}

function xmlRootRels(): string {
  return xmlDecl(`\
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
}

function xmlContentTypes(): string {
  return xmlDecl(`\
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
}

function xmlStyles(): string {
  return xmlDecl(`\
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);
}

function xmlAppProps(): string {
  return xmlDecl(`\
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>meDiary</Application>
</Properties>`);
}

function xmlCoreProps(): string {
  const now = new Date().toISOString();
  return xmlDecl(`\
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>meDiary Konsumvorgaenge</dc:title>
  <dc:creator>meDiary</dc:creator>
  <cp:lastModifiedBy>meDiary</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`);
}

function xmlDecl(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;
}

function colName(index: number): string {
  let n = index;
  let name = '';
  while (n > 0) {
    n--;
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26);
  }
  return name;
}

function colIndex(ref: string): number | null {
  const m = /^([A-Z]+)\d*$/i.exec(ref);
  if (!m) return null;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

interface ZipSource {
  name: string;
  data: string | Buffer;
}

function createZip(files: ZipSource[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime(new Date());

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function readZip(buffer: Buffer): Map<string, Buffer> {
  const eocd = findEndOfCentralDirectory(buffer);
  const total = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();

  let offset = centralOffset;
  for (let i = 0; i < total && offset < centralOffset + centralSize; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Ungültige XLSX-ZIP-Struktur.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Ungültiger XLSX-Dateieintrag.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) entries.set(name, Buffer.from(compressed));
    else if (method === 8) entries.set(name, inflateRawSync(compressed));
    else throw new Error(`Nicht unterstützte XLSX-Komprimierung: ${method}`);

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('Keine gültige XLSX-Datei.');
}

function resolveFirstSheetPath(entries: Map<string, Buffer>, workbookPath: string): string {
  const workbookXml = getTextEntry(entries, workbookPath);
  const sheetMatch = /<sheet\b([^>]*)\/?>/i.exec(workbookXml);
  const relId = sheetMatch ? attrs(sheetMatch[1])['r:id'] : null;
  const relsPath = `${dirname(workbookPath)}/_rels/${basename(workbookPath)}.rels`;
  if (relId && entries.has(relsPath)) {
    const rels = getTextEntry(entries, relsPath);
    for (const rel of rels.matchAll(/<Relationship\b([^>]*)\/?>/gi)) {
      const a = attrs(rel[1]);
      if (a.Id === relId && a.Target) return normalizeZipPath(dirname(workbookPath), a.Target);
    }
  }
  const fallback = findEntry(entries, /^xl\/worksheets\/sheet\d+\.xml$/);
  if (!fallback) throw new Error('Keine Tabelle in der XLSX-Datei gefunden.');
  return fallback;
}

function parseSharedStrings(entries: Map<string, Buffer>): string[] {
  if (!entries.has('xl/sharedStrings.xml')) return [];
  const xml = getTextEntry(entries, 'xl/sharedStrings.xml');
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((m) => extractTextNodes(m[1]).join(''));
}

function parseSheetRows(sheetXml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const row: string[] = [];
    let nextIndex = 0;
    const cells = rowMatch[1];
    for (const cellMatch of cells.matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const a = attrs(cellMatch[1] ?? cellMatch[2] ?? '');
      const body = cellMatch[3] ?? '';
      const index = a.r ? colIndex(a.r) ?? nextIndex : nextIndex;
      row[index] = parseCellValue(body, a.t, sharedStrings);
      nextIndex = index + 1;
    }
    rows.push(row);
  }
  return rows;
}

function parseCellValue(body: string, type: string | undefined, sharedStrings: string[]): string {
  if (type === 'inlineStr') return extractTextNodes(body).join('');
  const v = tagText(body, 'v');
  if (type === 's') return sharedStrings[Number(v)] ?? '';
  if (type === 'b') return v === '1' ? 'TRUE' : 'FALSE';
  if (type === 'e') return '';
  return decodeXml(v);
}

function tagText(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  return m ? decodeXml(m[1]) : '';
}

function extractTextNodes(xml: string): string[] {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((m) => decodeXml(m[1]));
}

function attrs(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/([A-Za-z_:][\w:.-]*)=(["'])(.*?)\2/g)) out[m[1]] = decodeXml(m[3]);
  return out;
}

function getTextEntry(entries: Map<string, Buffer>, name: string): string {
  const entry = entries.get(name);
  if (!entry) throw new Error(`XLSX-Eintrag fehlt: ${name}`);
  return entry.toString('utf8');
}

function findEntry(entries: Map<string, Buffer>, pattern: RegExp): string | null {
  for (const name of entries.keys()) if (pattern.test(name)) return name;
  return null;
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i) : '';
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

function normalizeZipPath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `${base}/${target}`.split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') normalized.pop();
    else normalized.push(part);
  }
  return normalized.join('/');
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, entity: string) => {
    const e = entity.toLowerCase();
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    if (e.startsWith('#x')) return String.fromCodePoint(Number.parseInt(e.slice(2), 16));
    return String.fromCodePoint(Number.parseInt(e.slice(1), 10));
  });
}

function dosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

let crcTable: Uint32Array | null = null;

function crc32(data: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export { XLSX_MIME };
