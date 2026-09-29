import { existsSync, readFileSync } from 'fs';
import { basename, resolve } from 'path';
import { DEFAULT_IGNORES } from '../core/ignore';
import { UserSettings, RUN_MODES, RunMode, Options } from '../types';
import { UsageError } from '../utils/errors';


export const DEFAULT_DEBOUNCE_MS = 300;
export const DEFAULT_KILL_TIMEOUT_MS = 3000;
export const CONFIG_FILE_NAME = 'stye.config.json';
export const PACKAGE_JSON_KEY = 'stye';

type Kind = 'string' | 'strings' | 'boolean' | 'number' | 'mode';

const SCHEMA: Record<keyof UserSettings, Kind> = {
    watch: 'strings',
    command: 'string',
    include: 'strings',
    ext: 'strings',
    ignore: 'strings',
    defaultIgnore: 'boolean',
    debounce: 'number',
    mode: 'mode',
    killTimeout: 'number',
    quiet: 'boolean',
    verbose: 'boolean',
    timestamps: 'boolean',
    color: 'boolean',
    keys: 'boolean',
    fallback: 'boolean',
};

function coerce(key: string, kind: Kind, value: unknown, source: string): unknown {
    const bad = (expected: string): UsageError => new UsageError(`${source}: "${key}" must be ${expected}.`);
    switch (kind) {
        case 'string':
            if (typeof value !== 'string') throw bad('a string');
            return value;
        case 'strings':
            if (typeof value === 'string') return [value];
            if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
            throw bad('a string or an array of strings');
        case 'boolean':
            if (typeof value !== 'boolean') throw bad('true or false');
            return value;
        case 'number':
            if (!Number.isInteger(value) || (value as number) < 0) throw bad('a whole number of milliseconds');
            return value;
        case 'mode':
            if (!RUN_MODES.includes(value as RunMode)) throw bad(`one of: ${RUN_MODES.join(', ')}`);
            return value;
    }
}

export function validateSettings(raw: unknown, source: string): UserSettings {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new UsageError(`${source}: expected a JSON object of settings.`);
    }
    const settings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (key === '$schema') continue;
        const kind = (SCHEMA as Record<string, Kind | undefined>)[key];
        if (!kind) throw new UsageError(`${source}: unknown setting "${key}".`);
        settings[key] = coerce(key, kind, value, source);
    }
    return settings as UserSettings;
}

function readSettingsFile(file: string, lenient: boolean): UserSettings {
    let json: unknown;
    try {
        json = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
        if (lenient) return {};
        throw new UsageError(`Could not read ${file}: ${(err as Error).message}`);
    }
    const raw = basename(file) === 'package.json' ? (json as Record<string, unknown> | null)?.[PACKAGE_JSON_KEY] : json;
    return raw === undefined ? {} : validateSettings(raw, file);
}

/**
 * Looks for settings in this order (first hit wins):
 *   1. the file passed with --config
 *   2. ./stye.config.json
 *   3. the "stye" key in ./package.json
 */
export function loadConfig(cwd: string, explicitPath?: string): UserSettings {
    if (explicitPath) {
        const file = resolve(cwd, explicitPath);
        if (!existsSync(file)) throw new UsageError(`Config file not found: ${explicitPath}`);
        return readSettingsFile(file, false);
    }
    const standalone = resolve(cwd, CONFIG_FILE_NAME);
    if (existsSync(standalone)) return readSettingsFile(standalone, false);
    const pkg = resolve(cwd, 'package.json');
    if (existsSync(pkg)) return readSettingsFile(pkg, true);
    return {};
}

function normaliseExtensions(list: string[]): string[] {
    return list.map((ext) => ext.replace(/^\./, '').toLowerCase()).filter(Boolean);
}

// Merges defaults < config file < CLI flags (CLI wins; arrays are replaced, not merged). 
export function resolveOptions(cli: UserSettings, config: UserSettings): Options {
    const merged: UserSettings = { ...config, ...cli };

    const watch = merged.watch ?? [];
    if (watch.length === 0) {
        throw new UsageError('Nothing to watch. Pass a <path>, use --watch, or set "watch" in the config file.');
    }
    const command = merged.command?.trim();
    if (!command) {
        throw new UsageError('No command to run. Pass one after the path, or set "command" in the config file.');
    }
    if (merged.quiet && merged.verbose) {
        throw new UsageError('"quiet" and "verbose" cannot both be enabled.');
    }

    return {
        watch,
        command,
        include: merged.include ?? [],
        ext: normaliseExtensions(merged.ext ?? []),
        ignore: [...(merged.defaultIgnore === false ? [] : DEFAULT_IGNORES), ...(merged.ignore ?? [])],
        debounceMs: merged.debounce ?? DEFAULT_DEBOUNCE_MS,
        mode: merged.mode ?? 'restart',
        killTimeoutMs: merged.killTimeout ?? DEFAULT_KILL_TIMEOUT_MS,
        logLevel: merged.quiet ? 'quiet' : merged.verbose ? 'verbose' : 'normal',
        timestamps: merged.timestamps ?? false,
        color: merged.color ?? true,
        keys: merged.keys ?? true,
        fallback: merged.fallback ?? false,
    };
}