// Driver for the csv-reader-speed entry: it answers every case in
// /input/cases.json with run() from solve.js and writes the answers,
// one per case and in order, to /output/answers.json.
// Outside the grading container, MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR
// stand in for /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Switch V8's incremental marking off before solve.js is loaded, so the
// whole parse runs under it (the rules allow an entry to tune this flag,
// and the house baseline runs with it).
setFlagsFromString('--no-incremental-marking');

const { run } = await import(new URL('./solve.js', import.meta.url).href);

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const answers = cases.map((entry) => run(entry.input));
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
