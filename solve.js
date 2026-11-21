// Satu scan native, dipakai bersama semua panggilan run(): berhenti di pemisah
// pertama (koma / CR / LF / quote) dari pos. Aman dipakai ulang karena run()
// sinkron dan selalu mengeset lastIndex sebelum exec; tidak ada state antar-run.
const delim = /[",\r\n]/g;

// solve.js — csv-reader-speed-01-run-20261121.
// Pembaca CSV yang jawabannya identik dengan csv-reader 1.0.0 (referensi make.fun),
// tapi jauh lebih cepat: field unquoted dipindai dengan satu regex native
// /[",\r\n]/g (berhenti di pemisah pertama), field ber-quote dicari quote
// penutupnya dengan indexOf lompat-lompat lalu di-slice sekali.
// ES module, tanpa dependensi. Export: run(input) -> {columns, rows, errors}.
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  // Hasil baca field terakhir: nilai, akhir (0 koma, 1 ganti baris, 2 habis), karakter dipertahankan.
  let val = '';
  let end = 0;
  let kept = 0;

  function pushErr(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Baca field tanpa quote dari pos, nilai awal `start`. Berhenti di koma / LF / CRLF /
  // akhir teks. CR liar dibuang + error, lalu lanjut membaca field yang sama.
  // Quote di dalam field unquoted adalah literal: ditempel lalu scan dilanjutkan.
  function readPlain(start) {
    let v = start;
    let k = 0;
    for (;;) {
      delim.lastIndex = pos;
      const m = delim.exec(text);
      if (m === null) {
        if (pos < len) {
          v += text.slice(pos);
          k += len - pos;
        }
        pos = len;
        end = 2;
        break;
      }
      const cut = m.index;
      const c = text.charCodeAt(cut);
      if (c === 34) {
        // Quote di dalam field unquoted = literal: tempel sampai quote, lanjut scan.
        if (cut > pos) {
          v += text.slice(pos, cut);
          k += cut - pos;
        }
        v += '"';
        k += 1;
        pos = cut + 1;
        continue;
      }
      if (c === 44) {
        if (cut > pos) {
          v += text.slice(pos, cut);
          k += cut - pos;
        }
        pos = cut + 1;
        end = 0;
        break;
      }
      if (c === 10) {
        if (cut > pos) {
          v += text.slice(pos, cut);
          k += cut - pos;
        }
        pos = cut + 1;
        line += 1;
        end = 1;
        break;
      }
      // CR: CRLF jadi ganti baris, CR sendirian dibuang + error lalu lanjut.
      if (text.charCodeAt(cut + 1) === 10) {
        if (cut > pos) {
          v += text.slice(pos, cut);
          k += cut - pos;
        }
        pos = cut + 2;
        line += 1;
        end = 1;
        break;
      }
      if (cut > pos) {
        v += text.slice(pos, cut);
        k += cut - pos;
      }
      pushErr('stray_cr');
      pos = cut + 1;
    }
    val = v;
    kept = k;
  }

  // Baca field ber-quote; pos menunjuk quote buka.
  function readQuoted() {
    const open = pos;
    let q = open + 1;
    let doubled = false;
    for (;;) {
      q = text.indexOf('"', q);
      if (q === -1) {
        // Quote tak pernah menutup: jadi karakter literal, baca ulang sebagai unquoted.
        pushErr('unterminated_quote');
        pos = open + 1;
        readPlain('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        doubled = true;
        q += 2;
        continue;
      }
      break;
    }
    const span = text.slice(open + 1, q);
    let v;
    if (!doubled && span.indexOf('\n') === -1 && span.indexOf('\r') === -1) {
      v = span;
    } else {
      // Jalur lambat: "" -> ", CR/LF di dalam -> LF; hitung baris HANYA di dalam span.
      let s = '';
      for (let i = 0; i < span.length; i++) {
        const c = span.charCodeAt(i);
        if (c === 34) {
          s += '"';
          i += 1;
        } else if (c === 13) {
          s += '\n';
          line += 1;
          if (span.charCodeAt(i + 1) === 10) i += 1;
        } else if (c === 10) {
          s += '\n';
          line += 1;
        } else {
          s += span[i];
        }
      }
      v = s;
    }
    pos = q + 1;
    if (pos >= len) {
      val = v;
      kept = 0;
      end = 2;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      val = v;
      kept = 0;
      end = 0;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      val = v;
      kept = 0;
      end = 1;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      val = v;
      kept = 0;
      end = 1;
      return;
    }
    // Junk setelah quote penutup ditempel apa adanya.
    readPlain(v);
    if (kept > 0) pushErr('quote_junk');
  }

  for (;;) {
    // Baris kosong bukan record.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readPlain('');
      fields.push(val);
    } while (end === 0);

    // Baris yang isinya hanya CR liar bukan record (error-nya tetap tercatat).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
