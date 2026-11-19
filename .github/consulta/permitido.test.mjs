import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { juzgar } from './permitido.mjs';

const ok = (tsv) => juzgar(tsv).permitido;

test('una o varias paginas de consulta nuevas entran en la excepcion', () => {
  assert.equal(ok('added\tconsulta/84086f2061/index.html\n'), true);
  assert.equal(ok('added\tconsulta/tok-consulta-02/index.html\nadded\tconsulta/a1b2c3d4e5/index.html\n'), true);
});

test('falla cerrado: todo lo demas vuelve a la aprobacion de June', () => {
  const casos = [
    '',                                                        // sin ficheros
    'modified\tconsulta/84086f2061/index.html',                // reescribe una publicada
    'removed\tconsulta/84086f2061/index.html',
    'renamed\tconsulta/84086f2062/index.html',
    'added\tconsulta/gracias/index.html.bak',
    'added\tconsulta/84086f2061/otra.html',                    // otro fichero en la carpeta
    'added\tconsulta/84086f2061/index.html\nadded\tindex.html', // una pagina mas otro fichero
    'added\t.github/workflows/consulta.yml',
    'added\tconsulta/../index.html',
    'added\tconsulta/ABC123/index.html',                       // token con mayusculas
    'added\tconsulta/abc/index.html',                          // token corto
    'added consulta/84086f2061/index.html',                    // sin tabulador
    'added\tconsulta/84086f2061/index.html\textra',
    Array.from({ length: 6 }, (_, i) => `added\tconsulta/tok-00000${i}/index.html`).join('\n'),
  ];
  for (const c of casos) assert.equal(ok(c), false, JSON.stringify(c));
  assert.equal(ok(undefined), false);
});

test('la CLI: sale 0 con PERMITIDO y 1 con NO-PERMITIDO', () => {
  const script = fileURLToPath(new URL('./permitido.mjs', import.meta.url));
  assert.match(execFileSync('node', [script], { input: 'added\tconsulta/84086f2061/index.html\n' }).toString(), /^PERMITIDO/);
  assert.throws(() => execFileSync('node', [script], { input: 'added\tindex.html\n', stdio: 'pipe' }),
    (e) => e.status === 1 && /NO-PERMITIDO/.test(e.stdout.toString()));
});
