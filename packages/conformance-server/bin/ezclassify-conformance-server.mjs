#!/usr/bin/env node
/**
 * CLI for the conformance replay server.
 *
 * Deliberately small: flags, a readiness line, and a clean shutdown on a
 * signal. Everything worth configuring is worth documenting, and there is not
 * much. A replay server that needed configuring would be a server with behavior
 * of its own.
 */

import { createRequire } from 'node:module';

import {
    startConformanceServer,
    TEST_BEARER_TOKEN,
    listIntegrationScenarios,
} from '../src/index.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const USAGE = `ezclassify-conformance-server: replay the EzClassify golden wire corpus over HTTP

Usage:
  npx @ezclassify/conformance-server [options]

Options:
  --port <n>        Port to listen on. 0 picks a free one. Default 4010.
  --host <addr>     Interface to bind. Default 127.0.0.1.
  --corpus <path>   Corpus JSON to replay. Default: the corpus bundled with this package.
  --scenario <name> Named integration profile using Cedar Valley recordings.
  --list-scenarios  Print built-in integration profiles and exit.
  --cors-origin <origin> Permit one browser development origin.
  --auth <mode>     none (default) or simulated.
  --quiet           Do not report unmatched requests on stderr.
  --version         Print the version and exit.
  --help            Print this and exit.

Simulated authentication accepts exactly one bearer:

  Authorization: Bearer ${TEST_BEARER_TOKEN}

Anything else gets the wire's constant refusal, byte for byte off the corpus.
Liveness and readiness answer without a credential, as the contract declares.

This server has no engine. It answers what was recorded and nothing else; an
unrecorded request gets an HTTP 501 diagnostic naming the nearest recording.
`;

/** Parse argv into options, or a directive to print something and stop. */
export function parseArgs(argv) {
    const options = { auth: 'none', host: '127.0.0.1', port: 4010 };
    for (let at = 0; at < argv.length; at += 1) {
        const flag = argv[at];
        const value = () => {
            const next = argv[at + 1];
            if (next === undefined || next.startsWith('--')) {
                throw new Error(`${flag} needs a value`);
            }
            at += 1;
            return next;
        };
        switch (flag) {
            case '--help':
            case '-h':
                return { directive: 'help' };
            case '--version':
                return { directive: 'version' };
            case '--port': {
                const port = Number(value());
                if (!Number.isInteger(port) || port < 0 || port > 65535) {
                    throw new Error('--port needs a port number');
                }
                options.port = port;
                break;
            }
            case '--host':
                options.host = value();
                break;
            case '--corpus':
                options.corpus = value();
                break;
            case '--list-scenarios':
                return { directive: 'scenarios' };
            case '--scenario':
                options.scenario = value();
                break;
            case '--cors-origin':
                options.corsOrigin = value();
                break;
            case '--auth':
                options.auth = value();
                break;
            case '--quiet':
                options.log = null;
                break;
            default:
                throw new Error(`unknown option ${flag}`);
        }
    }
    return { directive: 'serve', options };
}

async function main(argv) {
    let parsed;
    try {
        parsed = parseArgs(argv);
    } catch (cause) {
        process.stderr.write(`${cause.message}\n\n${USAGE}`);
        return 2;
    }
    if (parsed.directive === 'help') {
        process.stdout.write(USAGE);
        return 0;
    }
    if (parsed.directive === 'scenarios') {
        for (const { name, description } of listIntegrationScenarios())
            process.stdout.write(`${name}: ${description}\n`);
        return 0;
    }
    if (parsed.directive === 'version') {
        process.stdout.write(`${pkg.version}\n`);
        return 0;
    }

    let server;
    try {
        server = await startConformanceServer(parsed.options);
    } catch (cause) {
        process.stderr.write(`Cannot start: ${cause.message}\n`);
        return 1;
    }

    process.stdout.write(
        `EzClassify conformance replay server listening on ${server.url}\n` +
            `  corpus ${server.corpus.corpusVersion}: ${server.corpus.servable} recorded exchanges (${server.corpus.file})\n` +
            `  contract ${server.specVersion}, auth ${server.auth}\n` +
            (server.scenario
                ? `  integration scenario ${server.scenario}\n`
                : ''),
    );

    const shutdown = async () => {
        await server.stop();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return null;
}

const code = await main(process.argv.slice(2));
if (code !== null) process.exit(code);
