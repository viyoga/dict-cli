#!/usr/bin/env node
// dict — terminal word lookup powered by Wiktionary & Free Dictionary.
// Hybrid engine: Free Dictionary + Wikimedia REST + Commons Audio + Datamuse.
// Zero dependencies. Pure Node.js built-ins.
//
// Usage:
//   dict <word>            look up a word
//   dict -p <word>         look up and play pronunciation audio
//   dict <word> ...        look up multiple words
//   dict                   interactive REPL (:h for commands, :q to quit)
//
// Flags:
//   -p, --play             play pronunciation audio headlessly
//   -l, --lang <code>      language edition (default: en)
//   --all                  show every definition instead of first 3 per POS
//   --syn                  show synonyms & antonyms
//   --raw                  plain text, no ANSI colors or jabs (pipe-friendly)
//   -h, --help             show this help

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

require(path.join(__dirname, 'dict-engine.js'));
const E = globalThis.DictEngine;

const MAX_DEFS = 3;
const CACHE_DIR = path.join(process.env.XDG_CACHE_HOME || path.join(require('os').homedir(), '.cache'), 'dict-cli');

// ---- args & usage ----
function usage(code) {
  const out = code ? process.stderr : process.stdout;
  out.write(`dict — modern terminal dictionary & pronunciation engine

usage:
  dict                     interactive mode
  dict <word>              look up a word
  dict -p <word>           look up and play audio pronunciation
  dict <word1> <word2>...  look up multiple words

flags:
  -p, --play      play audio pronunciation (via mpv/ffplay, headless)
  -l, --lang <code> language edition (e.g. en, fr, de, es, ja; default: en)
  --all           show all definitions (default: top ${MAX_DEFS} per part of speech)
  --syn           show synonyms and antonyms
  --raw           plain text, no colors or jabs (great for pipes/scripts)
  -h, --help      display this help message

examples:
  dict serendipity
  dict -p run
  dict bonjour -l fr
  dict "quantum physics"
`);
  process.exit(code || 0);
}

const argv = process.argv.slice(2);
let lang = 'en';
let showAll = false;
let showSyn = false;
let playAudioFlag = false;
let raw = false;
const words = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-h' || a === '--help') usage(0);
  else if (a === '-p' || a === '--play') playAudioFlag = true;
  else if (a === '--all') showAll = true;
  else if (a === '--syn') showSyn = true;
  else if (a === '--raw') raw = true;
  else if (a === '-l' || a === '--lang') {
    lang = (argv[++i] || '').toLowerCase().trim();
    if (!lang) usage(1);
  } else if (a.startsWith('-')) usage(1);
  else words.push(a);
}

if (!E.langLabel(lang)) {
  process.stderr.write(`dict: unknown language "${lang}"\n`);
  process.exit(1);
}

// ---- color & formatting ----
// Deliberately uses standard 16 ANSI codes so colors adapt seamlessly to whatever
// terminal colorscheme is active (Catppuccin, Tokyo Night, Dracula, matugen, Noctalia).
const tty = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
const colorOn = tty && !raw;

const c = colorOn ? {
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
  accent: s => `\x1b[36m${s}\x1b[0m`,
  it: s => `\x1b[3m${s}\x1b[0m`,
  ok: s => `\x1b[32m${s}\x1b[0m`,
  warn: s => `\x1b[33m${s}\x1b[0m`,
  magenta: s => `\x1b[35m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`
} : {
  bold: s => s, dim: s => s, accent: s => s, it: s => s,
  ok: s => s, warn: s => s, magenta: s => s, red: s => s
};

function paint(code, s) { return colorOn ? `\x1b[${code}m${s}\x1b[0m` : s; }
function pill(s, hue) {
  if (!colorOn) return `[${s}]`;
  const code = hue ? `\x1b[${hue}m` : '\x1b[100m\x1b[97m';
  return `${code} ${s} \x1b[0m`;
}
function synPill(s) { return colorOn ? `\x1b[48;5;236m\x1b[32m ${s} \x1b[0m` : `[${s}]`; }
function antPill(s) { return colorOn ? `\x1b[48;5;236m\x1b[31m ${s} \x1b[0m` : `[${s}]`; }

const dot = c.dim('  ') + c.ok('·') + c.dim('  ');

// Part of speech hues for visual distinction
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
  return Math.max(40, Math.min(cols || 80, 100));
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

// ---- jabs & kaomoji for unknown queries ----
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
  'i looked everywhere. nothing. embarrassing.'
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
  '(´-ω-`)', '〜(꒪꒳꒪)〜', '(˘̩̩̩̩̩̩̩̩˘)', '(个_个)'
];

// ---- cache ----
function cachePath(word, targetLang) {
  const safe = encodeURIComponent(word.toLowerCase().trim()).replace(/%/g, '_');
  return path.join(CACHE_DIR, targetLang || lang, safe + '.json');
}

function readCache(word, targetLang) {
  try {
    const rawData = fs.readFileSync(cachePath(word, targetLang), 'utf8');
    return JSON.parse(rawData);
  } catch (e) {
    return null;
  }
}

function writeCache(word, entry, targetLang) {
  try {
    const p = cachePath(word, targetLang);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(entry));
  } catch (e) {
    /* best-effort cache */
  }
}

// ---- lookup logic ----
async function lookupWord(word, targetLang) {
  const currentLang = targetLang || lang;
  const cached = readCache(word, currentLang);
  if (cached && cached.__notfound !== true) return cached;

  const res = await E.lookup(word, currentLang);
  if (res.ok) {
    writeCache(word, res.entry, currentLang);
    return res.entry;
  }

  if (res.kind === 'notfound') {
    try {
      const p = cachePath(word, currentLang);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ __notfound: true }));
    } catch (e) {}
    const err = new Error(res.error || `no entry for "${word}"`);
    err.notFound = true;
    throw err;
  }

  throw new Error(res.error || 'lookup failed');
}

// Offline wordlist fallback loader
let wordlistLoaded = false;
function ensureWordlist() {
  if (wordlistLoaded) return;
  try {
    const wlPath = path.join(__dirname, 'dict-wordlist.js');
    if (fs.existsSync(wlPath)) {
      const src = fs.readFileSync(wlPath, 'utf8');
      const wl = new Function(src + '; return ENGLISH_WORDLIST;')();
      E.setWordlist(wl);
      wordlistLoaded = true;
    }
  } catch (e) {}
}

async function getSuggestions(word) {
  ensureWordlist();
  return await E.suggest(word);
}

// ---- spinner ----
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

// ---- rendering ----
function renderEntry(entry, opts = {}) {
  const width = termWidth();
  const willPlay = Boolean(opts.play || playAudioFlag);

  // Header line
  let head = c.bold(c.accent(entry.word));
  if (entry.phonetic) head += '  ' + c.dim(entry.phonetic);
  if (entry.audioUrl) head += '  ' + c.dim(colorOn ? '🔊' : '[audio]');
  if (entry.language && entry.language !== 'en') {
    head += '  ' + c.dim('[' + E.langLabel(entry.language) + ']');
  }

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
      for (let i = 1; i < lines.length; i++) {
        console.log('      ' + lines[i]);
      }

      if (def.example) {
        const exLines = wrapText('“' + def.example + '”', width - 8);
        for (const line of exLines) {
          console.log('      ' + c.dim(c.it(line)));
        }
      }

      if (def.translation) {
        const trLines = wrapText('→ ' + def.translation, width - 8);
        for (const line of trLines) {
          console.log('      ' + c.dim(line));
        }
      }
    });

    if (!showAll && meaning.definitions.length > MAX_DEFS) {
      console.log('      ' + c.dim(`… ${meaning.definitions.length - MAX_DEFS} more (--all)`));
    }

    // Synonyms & Antonyms
    if (showSyn || meaning.synonyms.length || meaning.antonyms.length) {
      if (meaning.synonyms && meaning.synonyms.length) {
        const syns = meaning.synonyms.slice(0, 8);
        console.log('      ' + c.dim('synonyms: ') + syns.map(s => c.ok(s)).join(c.dim(', ')));
      }
      if (meaning.antonyms && meaning.antonyms.length) {
        const ants = meaning.antonyms.slice(0, 8);
        console.log('      ' + c.dim('antonyms: ') + ants.map(s => c.warn(s)).join(c.dim(', ')));
      }
    }
  }

  // Source footer
  if (entry.source) {
    console.log('');
    console.log('  ' + c.dim(`(${entry.source})`));
  } else {
    console.log('');
  }

  // Play audio if requested
  if (willPlay && entry.audioUrl) {
    E.playAudio(entry.audioUrl);
  }
}

async function renderNotFound(word, targetLang) {
  const currentLang = targetLang || lang;
  const f = await getSuggestions(word);

  if (f.autoMatch) {
    console.log('');
    console.log(c.dim('did you mean ') + c.bold(c.accent(f.autoMatch)) + c.dim(' ?'));
    try {
      const entry = await lookupWord(f.autoMatch, currentLang);
      renderEntry(entry);
      return entry;
    } catch (e) {}
  }

  if (!raw && f.alternatives && f.alternatives.length) {
    console.log('');
    console.log(c.dim('not found — did you mean:'));
    console.log('  ' + f.alternatives.map(a => pill(a)).join('  '));
    console.log('');
    return null;
  }

  if (raw) {
    process.stderr.write(`no entry for "${word}"\n`);
    return null;
  }

  const jab = jabs[Math.floor(Math.random() * jabs.length)];
  const kao = kaomoji[Math.floor(Math.random() * kaomoji.length)];
  console.log('');
  console.log(c.accent(jab));
  console.log(c.dim(kao));
  console.log('');
  return null;
}

async function doLookup(word, opts = {}) {
  const currentLang = opts.lang || lang;
  const cached = readCache(word, currentLang);
  const stop = cached ? null : startSpinner(`looking up “${word}”`);

  let entry = null;
  let err = null;

  try {
    entry = await lookupWord(word, currentLang);
  } catch (e) {
    err = e;
  }

  if (stop) stop();

  if (!err && entry) {
    renderEntry(entry, opts);
    return entry;
  }

  if (err && err.notFound) {
    const matched = await renderNotFound(word, currentLang);
    return matched;
  }

  console.error(c.dim(err && err.name === 'AbortError'
    ? 'lookup timed out — please check network connection'
    : 'error: ' + (err ? err.message : 'lookup failed')));
  return null;
}

// ---- main runner ----
(async () => {
  if (words.length) {
    let ok = true;
    for (const w of words) {
      const res = await doLookup(w, { play: playAudioFlag });
      if (!res) ok = false;
    }
    process.exit(ok ? 0 : 1);
  }

  // ---- Interactive REPL ----
  console.log('');
  console.log(c.bold(c.accent('dict')) + dot + c.dim('hybrid terminal dictionary'));
  console.log(c.dim('type word to look up') + dot + c.dim(':p to play audio') + dot + c.dim(':all for all defs') + dot + c.dim(':q to quit'));
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.dim('dict') + ' ' + c.bold(c.accent('❯')) + ' '
  });

  rl.prompt();

  let lastEntry = null;
  let inflight = 0;

  const quitting = () => {
    console.log(c.dim('bye') + dot + c.dim('(˘︶˘)'));
    process.exit(0);
  };

  rl.on('line', async (line) => {
    const q = line.trim();
    if (!q) { rl.prompt(); return; }

    // REPL commands
    if (q === ':q' || q === ':quit' || q === ':exit') {
      if (!inflight) return quitting();
      rl.removeAllListeners('line');
      const timer = setInterval(() => { if (!inflight) { clearInterval(timer); quitting(); } }, 100);
      return;
    }

    if (q === ':p' || q === ':play') {
      if (lastEntry && lastEntry.audioUrl) {
        console.log(c.dim('  🔊 playing audio…'));
        E.playAudio(lastEntry.audioUrl);
      } else if (lastEntry) {
        console.log(c.dim('  no audio pronunciation available for “' + lastEntry.word + '”'));
      } else {
        console.log(c.dim('  look up a word first'));
      }
      rl.prompt();
      return;
    }

    if (q === ':all') {
      showAll = !showAll;
      console.log(c.dim(`showing all definitions: ${showAll ? 'enabled' : 'disabled'}`));
      rl.prompt();
      return;
    }

    if (q === ':syn') {
      showSyn = !showSyn;
      console.log(c.dim(`showing synonyms & antonyms: ${showSyn ? 'enabled' : 'disabled'}`));
      rl.prompt();
      return;
    }

    if (q.startsWith(':l ') || q.startsWith(':lang ')) {
      const target = q.split(/\s+/)[1];
      if (target && E.langLabel(target)) {
        lang = target.toLowerCase();
        console.log(c.dim(`switched language to ${E.langLabel(lang)} (${lang})`));
      } else {
        console.log(c.dim(`unknown language code. Available: ${E.LANGUAGES.map(x => x.value).join(', ')}`));
      }
      rl.prompt();
      return;
    }

    if (q === ':h' || q === ':help') {
      console.log('');
      console.log(c.bold('REPL Commands:'));
      console.log('  :p, :play       replay audio pronunciation for last word');
      console.log('  :all            toggle displaying all definitions');
      console.log('  :syn            toggle synonyms & antonyms display');
      console.log('  :l <code>       switch language (e.g. :l fr, :l de, :l en)');
      console.log('  :c, :clear      clear terminal screen');
      console.log('  :q, :quit       exit dict');
      console.log('');
      rl.prompt();
      return;
    }

    if (q === ':c' || q === ':clear') {
      process.stdout.write('\x1b[2J\x1b[0;0H');
      rl.prompt();
      return;
    }

    // Word lookup
    inflight++;
    try {
      const res = await doLookup(q);
      if (res) lastEntry = res;
    } finally {
      inflight--;
    }
    rl.prompt();
  });

  rl.on('close', () => {
    if (!inflight) return quitting();
    const timer = setInterval(() => { if (!inflight) { clearInterval(timer); quitting(); } }, 100);
  });

  rl.on('SIGINT', () => rl.close());
})();
