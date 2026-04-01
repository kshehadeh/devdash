export type CsvParseResult = { headers: string[]; rows: string[][] };

export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  function pushField() {
    row.push(field);
    field = "";
  }

  function pushRow() {
    rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (ch === "\r") {
      continue;
    }

    field += ch;
  }

  if (inQuotes) {
    throw new Error("CSV parse error: Unterminated quote.");
  }

  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  const [rawHeaders, ...dataRows] = rows;
  if (!rawHeaders) return { headers: [], rows: [] };
  return { headers: rawHeaders.map((h) => h.trim()), rows: dataRows };
}

export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}
