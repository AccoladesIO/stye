# 📁 stye

[![npm](https://img.shields.io/npm/v/@oxaccolades/stye)](https://www.npmjs.com/package/@oxaccolades/stye)
[![license](https://img.shields.io/npm/l/@oxaccolades/stye)](LICENSE)
[![node](https://img.shields.io/node/v/@oxaccolades/stye)](https://nodejs.org)

> Save a file. Run your command. Every time.

`stye` is a lightweight CLI that watches files or folders and re-runs a command when something changes. It has a single runtime dependency (`chalk`) and runs on Node.js 18 or newer.

```bash
stye ./src "npm test"
```

## ✨ Why stye

- **Nothing to configure to get started.** Point it at a path, give it a command.
- **Sensible by default.** Bursts of saves become one run, and `node_modules`, `.git`, `dist` and editor temp files are ignored.
- **You choose what happens mid-run.** Restart the command, queue exactly one more run, or run everything concurrently.
- **It stops what it starts.** Stopping a run ends the whole process tree, not just the top process.
- **Nothing hidden.** stye began as a way to learn how file watchers work under the hood. Watching, debouncing, glob matching, process control and the recursive-watch fallback are all written in this repo on top of native Node.js modules.

## 📦 Installation

Requires **Node.js 18 or newer**.

```bash
npm install -g @oxaccolades/stye
```

Or from source:

```bash
git clone https://github.com/Accoladesio/stye
cd stye
npm install      # also builds the project
npm link         # makes `stye` available globally
```

## 🚀 Quick start

```bash
stye ./src "npm run build"
```

Edit a file in `src`, and stye reacts:

```
[Change detected]: src/core/watcher.ts
[Running]: npm run build
...your command's output, streamed live...
[Done]: exit code 0 in 1.4s
```

A failed run ends with `[Failed]: exit code 1 in 1.4s`. Your command's stdout and stderr stream straight to the terminal, colours included.

## ⚙️ Usage

```
stye [options] <path> <command...>
stye [options] -w <path> [-w <path>...] <command...>
stye [options] -- <command...>        # paths/command come from the config file
```

Options go **before** the path or command; everything after them is the command. Quote the command if it contains shell characters such as `&&` or `|`.

### Examples

```bash
stye ./src "npm run build"
stye -w src -w tests -e ts,tsx --mode queue npm test
stye --ignore "*.{log,tmp}" . node server.js      # restarts the server on change
stye --verbose --timestamps ./src "npm run build"
```

## 🧰 Options

**Watching**

| Option | Description |
| --- | --- |
| `-w, --watch <path>` | File or folder to watch. Repeat for several |
| `-e, --ext <list>` | Only react to these extensions, e.g. `ts,js` |
| `--include <glob>` | Only react to matching paths (repeatable) |
| `--ignore <glob>` | Never react to matching paths (repeatable) |
| `--no-default-ignore` | Also watch `node_modules`, `.git`, `dist` and editor temp files |
| `--fallback` | Use the built-in directory walker instead of native recursive watching |

**Running**

| Option | Description |
| --- | --- |
| `-d, --debounce <ms>` | Quiet period after the last change before running (default `300`) |
| `-m, --mode <mode>` | `restart` (default), `queue` or `concurrent` |
| `--kill-timeout <ms>` | Wait this long after `SIGTERM` before `SIGKILL` (default `3000`) |

**Output and other**

| Option | Description |
| --- | --- |
| `-q, --quiet` / `--verbose` | Only errors and failed runs / extra diagnostics |
| `--timestamps` | Prefix log lines with the time |
| `--no-color` | Disable colours (`NO_COLOR` is honoured too) |
| `--no-keys` | Disable the interactive shortcuts |
| `-c, --config <file>` | Read settings from a JSON file |
| `-h, --help` / `-v, --version` | Help / version |

### Run modes

What happens when a change arrives while the command is still running:

- **restart** (default): stops the previous run, and everything it spawned, then starts a fresh one. Best for servers and dev tools.
- **queue**: leaves the running command alone. Changes that arrive meanwhile trigger exactly one more run afterwards. Best for builds and tests you don't want interrupted.
- **concurrent**: every change starts a new run immediately.

### Patterns

Globs support `*`, `**`, `?`, `[abc]`, `[!abc]` and `{a,b}`.

- **Without a `/`** the pattern matches any path segment: `node_modules`, `*.log`.
- **With a `/`** it is anchored to the watched folder: `src/generated`, `src/**/*.tmp`. Matching a folder covers everything inside it.
- `--ignore` wins over `--include` and `--ext`. An explicitly named *file* is always watched, whatever the filters say.

### Keys (interactive terminals only)

`r` rerun now · `c` clear screen · `q` or Ctrl+C quit

## 🧾 Config file

Instead of flags, put settings in a JSON file and just run `stye`.

```json
{
  "watch": ["src", "tests"],
  "command": "npm test",
  "ext": ["ts"],
  "ignore": ["src/generated", "*.snap"],
  "debounce": 200,
  "mode": "queue"
}
```

**Where stye looks** (first match wins):

1. the file passed with `--config <file>`
2. `stye.config.json` in the current folder
3. the `"stye"` key in the current folder's `package.json`

Available keys: `watch`, `command`, `include`, `ext`, `ignore`, `defaultIgnore`, `debounce`, `mode`, `killTimeout`, `quiet`, `verbose`, `timestamps`, `color`, `keys`, `fallback`. Unknown keys are reported by name.

CLI flags override the config file per key (lists are replaced, not merged). If the config supplies the paths, pass the command after `--`: `stye -- npm run lint`.

## 🔎 Behaviour

- **Recursive watching** with a built-in fallback for platforms where `fs.watch` cannot recurse (Node 18 on Linux). The fallback attaches one watcher per folder, follows folders being created or deleted, and never descends into ignored folders.
- **Debounced runs**: a burst of saves triggers one run.
- **Clean process control**: `SIGTERM`, then `SIGKILL` after the kill timeout, applied to the whole process tree (`taskkill /T` on Windows).
- **Live output**: stdout and stderr stream straight to your terminal, even when the command fails. Each run ends with its exit code and duration.
- **Friendly errors**: bad flags, bad config values or a missing path give a one-line message and a pointer to `stye --help`, not a stack trace.
- **Clean shutdown**: Ctrl+C or `SIGTERM` stops the watchers and any running command.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Clean shutdown (Ctrl+C, `q` or `SIGTERM`), or `--help` / `--version` |
| `1` | Unexpected runtime error |
| `2` | Usage error: bad flag, bad config value, or missing path |

## 🗂 Project layout

```
src/
├── index.ts                 entry point (wiring only)
├── cli/
│   ├── args.ts              flag parsing
│   ├── config.ts            config file loading, validation, option merging
│   └── help.ts              help text and version
├── core/
│   ├── watcher.ts           native watching, multiple targets
│   ├── fallback-watcher.ts  directory-walking watcher
│   ├── debounce.ts
│   ├── ignore.ts            include / ignore / extension filtering
│   └── runner.ts            restart / queue / concurrent command runner
├── utils/
│   ├── glob.ts              glob to RegExp
│   ├── logger.ts            levels, timestamps, colour
│   ├── keys.ts              interactive shortcuts
│   ├── shutdown.ts          signal and error handling
│   └── errors.ts
└── types/index.ts
tests/                       node:test suites (run with `npm test`)
```

## 🛠 Development

```bash
npm run dev -- ./src "echo changed"   # run from source with ts-node
npm run build                         # compile to dist/
npm test                              # run the test suite
```

## 🤝 Contributing

Contributions are welcome. Fork the repo, create a branch, make your change with tests, run `npm test`, and open a pull request describing what changed. See [CHANGELOG.md](CHANGELOG.md) for history.

## 📜 License

MIT © 2025 [Accoladesio](https://github.com/Accoladesio). See [LICENSE](LICENSE).