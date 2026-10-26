import type {
    BrokerConceptSource,
    ContextFromComponentsArgs,
    SourceProviderMap,
} from '../src';

const conceptSource: BrokerConceptSource = {
    providerId: 'provider:test',
    snapshotId: 'snapshot:test',
    async fetch() {
        return { ok: true, items: [] };
    },
};

const providers: SourceProviderMap = {};
providers.conceptSources = new Map([['source:test', conceptSource]]);

const context: ContextFromComponentsArgs = {
    scheme: {},
    sourceProviders: providers,
};

void context;
