#!/usr/bin/env node
import { parseArgs } from './cli/args';
import { loadConfig, resolveOptions } from './cli/config';
import { HELP_TEXT, readVersion } from './cli/help';
import { debounce } from './core/debounce';
import { createPathFilter } from './core/ignore';
import { CommandRunner } from './core/runner';
import { ActiveWatcher, startWatchers } from './core/watcher';
import { Options } from './types';
import { UsageError } from './utils/errors';
import { enableKeys } from './utils/keys';
import { createLogger } from './utils/logger';
import { registerShutdown } from './utils/shutdown';

function start(options: Options): void {
    const log = createLogger({ level: options.logLevel, timestamps: options.timestamps, color: options.color });
    const runner = new CommandRunner({
        command: options.command,
        mode: options.mode,
        killTimeoutMs: options.killTimeoutMs,
        log,
    });
    const pendingFiles = new Set<string>();

    const trigger = debounce(() => {
        log.change([...pendingFiles]);
        pendingFiles.clear();
        void runner.trigger();
    }, options.debounceMs);

    let watcher: ActiveWatcher | undefined;
    let restoreTerminal = (): void => undefined;
    const shutdown = registerShutdown(async () => {
        trigger.cancel();
        restoreTerminal();
        watcher?.close();
        await runner.stop();
    }, log);

    watcher = startWatchers({
        targets: options.watch,
        filter: createPathFilter({ include: options.include, ignore: options.ignore, ext: options.ext }),
        log,
        forceFallback: options.fallback,
        onChange: (file) => {
            pendingFiles.add(file);
            trigger();
        },
        onError: (err) => {
            log.error(`Watcher error: ${err.message}`);
            void shutdown(1);
        },
    });

    log.info(`Watching for changes in: ${options.watch.join(', ')}`);
    log.info(`Command to run on change: ${options.command} (${options.mode} mode)`);

    if (options.keys) {
        restoreTerminal = enableKeys({
            rerun: () => {
                trigger.cancel();
                pendingFiles.clear();
                log.info('Manual rerun.');
                void runner.trigger();
            },
            clear: () => log.clear(),
            quit: () => void shutdown(0),
        });
        if (process.stdin.isTTY) log.info('Keys: r = rerun, c = clear, q = quit.');
    }
}

function main(): void {
    const bootLog = createLogger({ level: 'normal', timestamps: false, color: true });
    try {
        const parsed = parseArgs(process.argv.slice(2));
        if (parsed.kind === 'help') return console.log(HELP_TEXT);
        if (parsed.kind === 'version') return console.log(readVersion());
        const config = loadConfig(process.cwd(), parsed.configPath);
        start(resolveOptions(parsed.settings, config));
    } catch (err) {
        if (!(err instanceof UsageError)) throw err;
        bootLog.error(err?.message as string);
        console.error('Run "stye --help" for usage.');
        process.exitCode = 2;
    }
}

main();