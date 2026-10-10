<div align="center">

<img src="assets/icon.png" width="140" alt="dict — modern terminal dictionary">

# dict

**A modern terminal dictionary that gets out of the way.**  
Instant word lookups, IPA phonetics, headless audio pronunciation, genuine examples, synonyms & antonyms, smart spelling suggestions, and 23 languages.

![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen?logo=nodedotjs&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-blue)
![deps](https://img.shields.io/badge/dependencies-zero-black)
![platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS-lightgrey)

</div>

---

## why

`dict` is zero-dependency, lightning fast, and zero-config: no API keys, no daemons, no compile steps. It combines the structured richness of Free Dictionary API with the sheer scale and reliability of the official Wikimedia REST API.

- **Clean definitions**: Real definitions and actual example sentences — no raw citation dumps or 18th-century blockquotes.
- **Audio pronunciations**: Hear native pronunciations headlessly in your terminal with `-p` / `--play` or `:p` in REPL mode (via `mpv` or `ffplay`).
- **Theme-adaptive ANSI**: Uses standard 16-color ANSI palettes so it seamlessly inherits your terminal's color scheme (Catppuccin, Tokyo Night, Dracula, Noctalia, matugen) without fighting it.
- **Smart suggestions**: Powered by Datamuse API with an offline 100k wordlist fallback so typos automatically suggest and resolve the right word.
- **Instant local cache**: Lookups are cached locally under `~/.cache/dict-cli/` — repeated lookups resolve in ~50ms completely offline.

```console
$ dict serendipity

serendipity  /ˌsɛɹ.ənˈdɪp.ɪ.ti/  🔊

  ▍ noun
   1  The phenomenon of making an unplanned, fortunate discovery through a
      combination of unexpected circumstances and insightful recognition.
   2  An unsought, unintended or unexpected, but fortunate, discovery or
      learning experience that occurs by accident.
   3  The occurrence and development of events by chance in a happy or
      beneficial way.

  (Wiktionary)
```

---

## install

### one-liner (recommended)

```sh
curl -fsSL https://raw.githubusercontent.com/viyoga/dict-cli/main/install.sh | sh
```

The script:
1. checks for **node ≥ 18**,
2. downloads the source files into `~/.local/share/dict-cli`,
3. symlinks the `dict` command into `~/.local/bin`,
4. verifies that `~/.local/bin` is on your `PATH`.

### from source (git)

```sh
git clone https://github.com/viyoga/dict-cli.git
cd dict-cli
chmod +x dict.js

# run in place
./dict.js serendipity

# or link it to your PATH
mkdir -p ~/.local/bin
ln -sf "$PWD/dict.js" ~/.local/bin/dict
```

---

## usage

```sh
dict                     # interactive REPL (:h for commands, :q to quit)
dict serendipity         # one-shot lookup
dict -p run              # look up and play pronunciation audio headlessly
dict run jump skip       # multiple words in one go
dict bonjour -l fr       # French edition of Wiktionary (includes translations!)
dict run --all           # show all definitions instead of top 3
dict run --syn           # show synonyms and antonyms
dict time --raw          # plain text, no ANSI colors (great for piping)
```

| flag | description |
|------|-------------|
| `-p`, `--play` | play audio pronunciation headlessly (via `mpv` or `ffplay`) |
| `-l`, `--lang <code>` | language edition — `en fr de es ja …` (23 total, default: `en`) |
| `--all` | show **all** definitions instead of top 3 per part of speech |
| `--syn` | show synonyms and antonyms badges |
| `--raw` | plain text output without ANSI colors or jokes (pipe-friendly) |
| `-h`, `--help` | show help and usage |

---

## interactive repl

Run `dict` without arguments to launch the interactive prompt:

```console
dict · hybrid terminal dictionary
type word to look up · :p to play audio · :all for all defs · :q to quit

dict ❯ serendipity
...

dict ❯ :p              # replay pronunciation audio
dict ❯ :all             # toggle showing all definitions
dict ❯ :syn             # toggle synonyms and antonyms
dict ❯ :l fr            # switch language to French
dict ❯ :h               # show interactive help
dict ❯ :q               # quit
```

---

## available languages

`ar` Arabic · `bn` Bengali · `zh` Chinese · `nl` Dutch · `en` English ·
`fr` French · `de` German · `hi` Hindi · `id` Indonesian · `it` Italian ·
`ja` Japanese · `ko` Korean · `ms` Malay · `fa` Persian · `pl` Polish ·
`pt` Portuguese · `ru` Russian · `es` Spanish · `sw` Swahili · `sv` Swedish ·
`th` Thai · `tr` Turkish · `vi` Vietnamese

---

## architecture & engine

- **Multi-tier hybrid lookup**:
  1. *Primary*: Queries Free Dictionary API for phonetic transcriptions, direct audio URLs, definitions, and synonyms.
  2. *Fallback*: Seamlessly falls back to the official Wikimedia REST API (`/api/rest_v1/page/definition/`), cleanly parsing HTML definitions and examples without blockquote citations.
  3. *Metadata & Audio*: Enriches IPA phonetics and Wikimedia Commons audio recordings via MediaWiki query endpoints.
- **Headless audio**: Audio playback runs completely detached (`mpv --no-video --vo=null` / `ffplay -nodisp`) with zero GUI windows and zero terminal hijacking.
- **Fuzzy Did-You-Mean**: Fast typo auto-correction via Datamuse API, backed by an offline 100k-word English list.
- **Zero dependencies**: Pure Node.js built-ins (`https`, `child_process`, `readline`, `fs`).

---

## requirements

- [node](https://nodejs.org) **≥ 18** (for native `fetch`)
- Optional for audio: `mpv` or `ffplay` (ffmpeg)
- Linux or macOS

---

## license

MIT © [viyoga](https://github.com/viyoga)
