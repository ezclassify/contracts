import type {
    LayerBlock,
    LayerBlockDoc,
    LayerRemoval,
    LayerRemovalDoc,
} from '../src/index';

const recognizerRemoval: LayerRemoval = { recognizer: 'exception' };
const authoredRemoval: LayerRemovalDoc = recognizerRemoval;
void authoredRemoval;

declare const resolvedLayer: LayerBlock;
const authoredLayer: LayerBlockDoc = resolvedLayer;
void authoredLayer;

// @ts-expect-error a removal must name a declared element kind
const invalidRemoval: LayerRemoval = { unknown: 'exception' };
void invalidRemoval;
