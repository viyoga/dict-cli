#!/usr/bin/env node
// dict — terminal word lookup powered by Wiktionary.
// Engine ported from tristonarmstrong/omarchy-dictionary (Model.js, MIT).
// One-shot:  dict <word>
// REPL:      dict            (type words at the prompt, :q to quit)
// Flags:     -l <code>  language edition (en, fr, de, ja, …)
//            --all      show every definition instead of the first 3 per POS
//            --raw      pipe-friendly plain text (no ANSI, no jabs)
//            -h/--help

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

require(path.join(__dirname, 'dict-engine.js'));
const E = globalThis.DictEngine;

const MAX_DEFS = 3;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_DIR = path.join(process.env.XDG_CACHE_HOME || path.join(require('os').homedir(), '.cache'), 'dict-cli');

// ---- args ----
function usage(code) {
  const out = code ? process.stderr : process.stdout;
  out.write(`dict — look up English words (Wiktionary)

usage:
  dict                interactive mode
  dict <word>         look up a word
  dict <word> ...     multiple words in one go

flags:
  -l <code>   language edition (${E.LANGUAGES.map(l => l.value).join(', ')}; default en)
  --all       show every definition, not just the first ${MAX_DEFS} per part of speech
  --raw       plain text, no colors or jokes — good for piping
  -h, --help  this text
`);
  process.exit(code || 0);
}

const argv = process.argv.slice(2);
let lang = 'en';
let showAll = false;
let raw = false;
const words = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-h' || a === '--help') usage(0);
  else if (a === '--all') showAll = true;
  else if (a === '--raw') raw = true;
  else if (a === '-l' || a === '--lang') {
    lang = (argv[++i] || '').toLowerCase();
    if (!lang) usage(1);
  } else if (a.startsWith('-')) usage(1);
  else words.push(a);
}
if (!E.langLabel(lang)) {
  process.stderr.write(`dict: unknown language "${lang}"\n`);
  process.exit(1);
}

// ---- color ----
// Deliberately kept to the base 16 ANSI codes (no 256-color/truecolor hex)
// so the app inherits whatever terminal theme is active — Catppuccin,
// Dracula, matugen, whatever — instead of fighting it with hardcoded hues.
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const colorOn = tty && !raw;
const c = colorOn ? {
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
  accent: s => `\x1b[36m${s}\x1b[0m`,
  it: s => `\x1b[3m${s}\x1b[0m`,
  ok: s => `\x1b[32m${s}\x1b[0m`
} : {
  bold: s => s, dim: s => s, accent: s => s, it: s => s, ok: s => s
};
// `paint` is for the part-of-speech hue cycle; `pill` is a soft badge used
// for "did you mean" suggestions.
function paint(code, s) { return colorOn ? `\x1b[${code}m${s}\x1b[0m` : s; }
function pill(s) { return colorOn ? `\x1b[100m\x1b[97m ${s} \x1b[0m` : `[${s}]`; }
const dot = c.dim('  ') + c.ok('·') + c.dim('  ');

// Stable color per part of speech so "noun" is always the same hue in a
// given run — common ones get a curated color, anything else falls back to
// a deterministic hash so it's at least consistent.
const POS_HUES = {
  noun: 36, verb: 35, adjective: 33, adj: 33, adverb: 32, adv: 32,
  pronoun: 34, preposition: 34, postposition: 34, determiner: 34,
  article: 34, conjunction: 34, interjection: 31, numeral: 33,
  idiom: 35, phrase: 35, proverb: 35, prefix: 33, suffix: 33
};
function posHue(pos) {
  if (POS_HUES[pos]) return POS_HUES[pos];
  let h = 0;
  for (let i = 0; i < pos.length; i++) h = (h * 31 + pos.charCodeAt(i)) >>> 0;
  const hues = [31, 32, 33, 34, 35, 36];
  return hues[h % hues.length];
}

// ---- layout ----
function termWidth() {
  const cols = process.stdout.columns;
  return Math.max(40, Math.min(cols || 80, 96));
}
function wrapText(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if (cur.length + 1 + w.length > width) { lines.push(cur); cur = w; }
    else cur += ' ' + w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

const jabs = [
  'nice try. did you mean to spell that correctly?',
  'that\'s not a word. try again, genius.',
  'spell check is free, you know.',
  'did you hit the keyboard with your face?',
  'not in the dictionary. shocking.',
  'maybe try English next time.',
  'i looked it up. it doesn\'t exist. just like— nevermind.',
  'you call that a word?',
  'are you sure you know how to read?',
  'that word is as real as your plans.',
  'congratulations. you invented a word nobody uses.',
  'error 404: word not found. skill issue.',
  'did you have a stroke while typing?',
  'the dictionary said "lol no".',
  'that\'s not a word. try harder.',
  'are you typing with your elbows?',
  'even autocorrect gave up on that one.',
  'i googled it. nothing. embarrassing.',
];
const kaomoji = [
  '(◍•ᴗ•◍)♡ ✧*。', '(つ◉益◉)つ', '(╯°□°）╯︵ ┻━┻',
  '(⊙_⊙)', '(¬_¬)', '(￣ヘ￣)', 'ಠ_ಠ', '(；一_一)',
  '(▀̿̿Ĺ̯̿̿▀̿ ̿)', '( ͡° ͜ʖ ͡°)', '(ʘ‿ʘ)', 'ʕ•ᴥ•ʔ',
  '(ノಠ益ಠ)ノ', '︵ヽ(`Д´)ﾉ︵', '┐(\'～`;)┌',
  '(◔_◔)', '(-_-;)', '(＃￣ω￣)', '＜（－︿－）＞',
  '(◕‿◕)', '(ᗒᗨᗕ)', 'ヽ(´ー｀)ノ', '＼(◎o◎)／',
  '(＾▽＾)', 'ᕙ(▀̿̿Ĺ̯̿̿▀̿ ̿)ᕗ', '┬─┬ノ( º _ ºノ)',
  '(ಥ_ಥ)', '(◞‸◟)', '〳◔Ĺ̯◔〵', '(;´Д`)',
  '(´-ω-`)', '〜(꒪꒳꒪)〜', '(˘̩̩̩̩̩̩̩̩˘)', '(个_个)',
  'ヽ(￣д￣;)ノ', '(￣□￣;)', '∑(O_O;)', '(╯▽╰)',
];

// ---- cache ----
function cachePath(word) {
  const safe = encodeURIComponent(word.toLowerCase()).replace(/%/g, '_');
  return path.join(CACHE_DIR, lang, safe + '.json');
}
function readCache(word) {
  try { return JSON.parse(fs.readFileSync(cachePath(word), 'utf8')); }
  catch (e) { return null; }
}
function writeCache(word, entry) {
  try {
    fs.mkdirSync(path.dirname(cachePath(word)), { recursive: true });
    fs.writeFileSync(cachePath(word), JSON.stringify(entry));
  } catch (e) { /* cache is best-effort */ }
}

// ---- lookup ----
async function fetchExtract(word) {
  const url = E.lookupUrl(word, lang);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function lookup(word) {
  const cached = readCache(word);
  if (cached && cached.__notfound !== true) return cached;

  const res = E.parseResponse(await fetchExtract(word), lang);
  if (res.ok) {
    writeCache(word, res.entry);
    return res.entry;
  }
  if (res.kind === 'notfound') {
    // remember misses so repeated typos don't refetch
    try {
      fs.mkdirSync(path.dirname(cachePath(word)), { recursive: true });
      fs.writeFileSync(cachePath(word), JSON.stringify({ __notfound: true }));
    } catch (e) {}
    const err = new Error(res.error);
    err.notFound = true;
    throw err;
  }
  throw new Error(res.error || 'lookup failed');
}

// ---- fuzzy / suggestions ----
let wordlistLoaded = false;
function suggest(word) {
  if (!wordlistLoaded) {
    try {
      const src = fs.readFileSync(path.join(__dirname, 'dict-wordlist.js'), 'utf8');
      E.setWordlist(new Function(src + '; return ENGLISH_WORDLIST;')());
      wordlistLoaded = true;
    } catch (e) { /* no suggestions without the list */ }
  }
  return E.fuzzyMatch(word);
}

// ---- spinner ----
// Cached lookups resolve near-instantly so doLookup() skips the spinner for
// those; anything that has to hit the network gets one, so a slow reply
// reads as "fetching" instead of "did this thing hang".
let cursorHidden = false;
function hideCursor() { if (tty) { process.stdout.write('\x1b[?25l'); cursorHidden = true; } }
function showCursor() { if (cursorHidden) { process.stdout.write('\x1b[?25h'); cursorHidden = false; } }
process.on('exit', showCursor);

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
function startSpinner(label) {
  if (!colorOn) return null;
  let i = 0;
  hideCursor();
  process.stdout.write(`${c.accent(SPINNER_FRAMES[0])} ${c.dim(label)}`);
  const timer = setInterval(() => {
    i = (i + 1) % SPINNER_FRAMES.length;
    process.stdout.write(`\r${c.accent(SPINNER_FRAMES[i])} ${c.dim(label)}`);
  }, 80);
  return function stop() {
    clearInterval(timer);
    process.stdout.write('\r\x1b[K');
    showCursor();
  };
}

// ---- render ----
function renderEntry(entry) {
  const width = termWidth();
  let head = c.bold(c.accent(entry.word));
  if (entry.phonetic) head += '  ' + c.dim(entry.phonetic);
  if (entry.language && entry.language !== 'en') head += '  ' + c.dim('[' + E.langLabel(entry.language) + ']');
  console.log('');
  console.log(head);

  for (const meaning of entry.meanings) {
    const pos = String(meaning.partOfSpeech || '').toLowerCase();
    const hue = posHue(pos);
    console.log('');
    console.log('  ' + paint(hue, '▍') + ' ' + paint(hue, pos));

    const defs = showAll ? meaning.definitions : meaning.definitions.slice(0, MAX_DEFS);
    defs.forEach((def, idx) => {
      const num = c.dim(String(idx + 1).padStart(2, ' '));
      const lines = wrapText(def.definition, width - 6);
      console.log('  ' + num + '  ' + lines[0]);
      for (let i = 1; i < lines.length; i++) console.log('      ' + lines[i]);
      if (def.example) {
        const exLines = wrapText('“' + def.example + '”', width - 8);
        for (const line of exLines) console.log('      ' + c.dim(c.it(line)));
      }
    });
    if (!showAll && meaning.definitions.length > MAX_DEFS) {
      console.log('      ' + c.dim(`… ${meaning.definitions.length - MAX_DEFS} more (--all)`));
    }
  }
  console.log('');
}

function renderNotFound(word) {
  const f = suggest(word);
  if (f.autoMatch) {
    console.log('');
    console.log(c.dim('did you mean ') + c.bold(c.accent(f.autoMatch)) + c.dim(' ?'));
    return lookup(f.autoMatch).then(renderEntry);
  }
  if (!raw && f.alternatives.length) {
    console.log('');
    console.log(c.dim('not found — did you mean:'));
    console.log('  ' + f.alternatives.map(pill).join('  '));
    console.log('');
    return;
  }
  if (raw) {
    console.error(`no entry for "${word}"`);
    return;
  }
  const jab = jabs[Math.floor(Math.random() * jabs.length)];
  const kao = kaomoji[Math.floor(Math.random() * kaomoji.length)];
  console.log('');
  console.log(c.accent(jab));
  console.log(c.dim(kao));
  console.log('');
}

async function doLookup(word) {
  const cached = readCache(word);
  const stop = cached ? null : startSpinner(`looking up “${word}”`);
  let entry, err;
  try { entry = await lookup(word); } catch (e) { err = e; }
  if (stop) stop();

  if (!err) { renderEntry(entry); return true; }
  if (err.notFound) { await renderNotFound(word); return false; }
  console.error(c.dim(err.name === 'AbortError'
    ? 'took too long — is the network up?'
    : 'error: ' + err.message));
  return false;
}

// ---- main ----
(async () => {
  if (words.length) {
    let ok = true;
    for (const w of words) ok = (await doLookup(w)) && ok;
    process.exit(ok ? 0 : 1);
  }

  // REPL
  console.log('');
  console.log(c.bold(c.accent('dict')) + dot + c.dim('wiktionary lookup'));
  console.log(c.dim('type a word to look up') + dot + c.dim(':q to quit') + dot + c.dim('-h for flags'));
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.dim('dict') + ' ' + c.bold(c.accent('❯')) + ' '
  });
  rl.prompt(); // <- this was missing, which is why the prompt never showed up
               //    until you typed something and the first keypress forced
               //    a redraw. readline never prints its own prompt for you.

  let inflight = 0;
  const quitting = () => {
    console.log(c.dim('bye') + dot + c.dim('(˘︶˘)'));
    process.exit(0);
  };
  rl.on('line', async (line) => {
    const q = line.trim();
    if (!q) { rl.prompt(); return; }
    if (q === ':q' || q === ':quit' || q === ':exit') {
      if (!inflight) return quitting();
      // wait for pending lookups, then quit
      rl.removeAllListeners('line');
      const timer = setInterval(() => { if (!inflight) { clearInterval(timer); quitting(); } }, 100);
      return;
    }
    inflight++;
    try { await doLookup(q); } finally { inflight--; }
    rl.prompt();
  });
  rl.on('close', () => {
    if (!inflight) return quitting();
    const timer = setInterval(() => { if (!inflight) { clearInterval(timer); quitting(); } }, 100);
  });
  rl.on('SIGINT', () => rl.close());
})();
