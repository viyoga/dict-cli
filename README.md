<div align="center">

<img src="assets/icon.png" width="140" alt="dict — terminal word lookup">

# dict

```
      $$\ $$\             $$\
      $$ |\__|            $$ |
 $$$$$$$ |$$\  $$$$$$$\ $$$$$$\
$$  __$$ |$$ |$$  _____|\_$$  _|
$$ /  $$ |$$ |$$ /        $$ |
$$ |  $$ |$$ |$$ |        $$ |$$\
\$$$$$$$ |$$ |\$$$$$$$\   \$$$$  |
 \_______|\__| \_______|   \____/
```

**A terminal dictionary that gets out of the way.**
Look up any word without leaving your shell — definitions, phonetics,
part-of-speech colouring, fuzzy "did you mean" suggestions, and 23 language
editions of Wiktionary.

![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen?logo=nodedotjs&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-blue)
![deps](https://img.shields.io/badge/dependencies-zero-black)
![platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS-lightgrey)

</div>

---

## why

`dict` is zero-dependency and zero-config: no API keys, no daemons, no build
step. One fetch to Wiktionary, one pretty print. It remembers what it looked
up (so repeats are instant), corrects your typos with a 370k-word fuzzy
matcher, and never hardcodes colours — it inherits whatever terminal theme
you already have.

```console
$ dict time

  time  /taɪm/

  noun · 31 definitions
    · The inevitable progression into the future with the passing of present
      events into the past…
    · The quantity of duration of an event; a duration…
    …

  verb · 6 definitions
    · To measure or record the time, duration, or rate of something…
```

*(actual output is colour-coded per part of speech)*

## install

### one-liner (recommended)

```sh
curl -fsSL https://raw.githubusercontent.com/hiraeth-dev/dict-cli/main/install.sh | sh
```

The script:
1. checks for **node ≥ 18**,
2. downloads the three source files into `~/.local/share/dict-cli`,
3. symlinks the `dict` command into `~/.local/bin`,
4. warns you if `~/.local/bin` isn't on your `PATH`.

> Prefer to read before you pipe? [install.sh](install.sh) is ~60 lines of plain sh.

### from source (git)

```sh
git clone https://github.com/hiraeth-dev/dict-cli.git
cd dict-cli
chmod +x dict.js

# run in place
./dict.js serendipity

# or put it on your PATH
mkdir -p ~/.local/bin
ln -sf "$PWD/dict.js" ~/.local/bin/dict
```

## usage

```sh
dict                    # interactive REPL — type words at the prompt
dict time               # one-shot lookup
dict time space cat     # multiple words in one go
dict bonjour -l fr      # French edition of Wiktionary
dict obfuscate --all    # every definition, not just the first 3 per POS
dict time --raw         # plain text, no ANSI — perfect for piping
```

| flag | what it does |
|------|--------------|
| `-l <code>` | language edition — `en fr de ja …` (23 total) |
| `--all` | show **all** definitions instead of the top 3 per part of speech |
| `--raw` | pipe-friendly output: no colours, no jokes |
| `-h`, `--help` | usage |

<details>
<summary><strong>available languages</strong></summary>

<br>

`ar` Arabic · `bn` Bengali · `zh` Chinese · `nl` Dutch · `en` English ·
`fr` French · `de` German · `hi` Hindi · `id` Indonesian · `it` Italian ·
`ja` Japanese · `ko` Korean · `ms` Malay · `fa` Persian · `pl` Polish ·
`pt` Portuguese · `ru` Russian · `es` Spanish · `sw` Swahili · `sv` Swedish ·
`th` Thai · `tr` Turkish · `vi` Vietnamese

</details>

## how it works

- **Engine** — queries Wiktionary's MediaWiki `extracts` API and parses the
  sectioned plain-text wikitext (`== English == / === Noun === / …`) into
  structured entries: word, IPA phonetics, part of speech, definitions.
- **Case handling** — Wiktionary titles are case-sensitive (`Time` is a
  Norwegian municipality, not the word you wanted). Lookups walk candidate
  spellings — common word first, proper noun last — so `time`, `Time` and
  `TIME` all land on the right entry.
- **Fuzzy matching** — on a miss, a Levenshtein matcher over a bundled
  ~370k-word English list suggests "did you mean …" candidates.
- **Cache** — results live in `$XDG_CACHE_HOME/dict-cli` (usually
  `~/.cache/dict-cli`); repeated lookups are instant and offline.

## requirements

- [node](https://nodejs.org) **≥ 18** (for native `fetch`)
- Linux or macOS (anything with a POSIX sh for the installer)
- internet connection for the first lookup of each word

## uninstall

```sh
rm -rf ~/.local/share/dict-cli ~/.local/bin/dict ~/.cache/dict-cli
```

---

<div align="center">
<sub>engine ported from <a href="https://github.com/tristonarmstrong/omarchy-dictionary">omarchy-dictionary</a> (MIT) · data © <a href="https://en.wiktionary.org">Wiktionary</a> contributors (CC BY-SA) · built by <a href="https://github.com/hiraeth-dev">hiraeth-dev</a></sub>
</div>
