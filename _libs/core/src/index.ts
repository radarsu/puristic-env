export { type Classification, type ClassifyInput, classify, type VarStatus } from "./classify.js";
export { formatLeafComment } from "./codegen/formatLeafComment.js";
export { generateDts } from "./codegen/generateDts.js";
export { type CodegenOptions, generateEnvExample } from "./codegen/generateEnvExample.js";
export { generateJsonSchema } from "./codegen/generateJsonSchema.js";
export { type ConfigDefinition, type ConfigHandle, createConfig } from "./createConfig.js";
export { decrypt } from "./crypto/decrypt.js";
export { encrypt } from "./crypto/encrypt.js";
export { ENVELOPE_PREFIX, isEnvelope } from "./crypto/format.js";
export { generateKeypair, type Keypair } from "./crypto/keygen.js";
export {
    type DecryptOptions,
    defaultPrivateKeyPath,
    PUBLIC_KEY_PATH,
    resolvePrivateKey,
    resolveProjectName,
    resolvePublicKey,
} from "./crypto/resolveKey.js";
export { associateConfigs } from "./discovery/associate.js";
export { groupByDirectory } from "./discovery/groupByDirectory.js";
export { baseName, dirOf, isAncestorOrSame } from "./discovery/paths.js";
export {
    addKey,
    type EnvDocument,
    type EnvLine,
    getValue,
    listEntries,
    parseEnv,
    type QuoteStyle,
    removeKey,
    serializeEnv,
    setValue,
} from "./envText.js";
export { expandEnv, expandValue } from "./expandEnv.js";
export { inspectSchema, type LeafConstraint, type LeafDescriptorPublic, type LeafTypeTag } from "./inspectSchema.js";
export { extractDefinition, loadConfig, loadDefinition } from "./loadConfig.js";
export type { Source, SourceContext } from "./source.js";
export { type CliArgsOptions, cliArgs } from "./sources/cliArgs.js";
export { type EnvOptions, env } from "./sources/env.js";
export { envFile } from "./sources/envFile.js";
export { type LeafValidation, type ValidationReport, validateValues } from "./validateValues.js";
