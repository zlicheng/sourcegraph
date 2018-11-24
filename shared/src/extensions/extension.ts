import { Extension } from '../api/client/extension'
import * as GQL from '../graphql/schema'
import { ExtensionManifest } from '../schema/extension.schema'
import { Settings } from '../settings/settings'
import { ErrorLike, isErrorLike } from '../util/errors'
import { parseJSONCOrError } from '../util/jsonc'

/**
 * Describes a configured extension.
 *
 * @template X the registry extension type
 */
export interface ConfiguredExtension<
    X extends Pick<GQL.IRegistryExtension, 'id' | 'url' | 'viewerCanAdminister'> = Pick<
        GQL.IRegistryExtension,
        'id' | 'url' | 'viewerCanAdminister'
    >
> extends Pick<Extension, 'id'> {
    /** The parsed extension manifest, null if there is none, or a parse error. */
    readonly manifest: ExtensionManifest | null | ErrorLike

    /** The raw extension manifest (JSON), or null if there is none. */
    readonly rawManifest: string | null

    /** The corresponding extension on the registry, if any. */
    readonly registryExtension?: X
}

type MinimalRegistryExtension = Pick<GQL.IRegistryExtension, 'extensionID' | 'id' | 'url' | 'viewerCanAdminister'> & {
    manifest: { raw: string } | null
}

/**
 * Converts each element of an array to a {@link ConfiguredExtension} value.
 *
 * @template X the extension type
 */
export function toConfiguredExtensions<X extends MinimalRegistryExtension>(
    registryExtensions: X[]
): ConfiguredExtension<X>[] {
    const configuredExtensions: ConfiguredExtension<X>[] = []
    for (const registryExtension of registryExtensions) {
        configuredExtensions.push(toConfiguredExtension<X>(registryExtension))
    }
    return configuredExtensions
}

/**
 * Converts to a {@link ConfiguredExtension} value.
 *
 * @template X the extension type
 */
export function toConfiguredExtension<X extends MinimalRegistryExtension>(extension: X): ConfiguredExtension<X> {
    return {
        id: extension.extensionID,
        manifest: extension.manifest ? parseJSONCOrError<ExtensionManifest>(extension.manifest.raw) : null,
        rawManifest: (extension && extension.manifest && extension.manifest.raw) || null,
        registryExtension: extension,
    }
}

/** Reports whether the given extension is enabled in the settings. */
export function isExtensionEnabled(settings: Settings | ErrorLike | null, extensionID: string): boolean {
    return !!settings && !isErrorLike(settings) && !!settings.extensions && !!settings.extensions[extensionID]
}

/**
 * Returns the extension's script URL from its manifest.
 *
 * @param extension The extension whose script URL to get.
 * @throws If the script URL can't be determined.
 * @returns The extension's script URL.
 */
export function getScriptURLFromExtensionManifest(extension: Extension): string {
    if (!extension.manifest) {
        throw new Error(`unable to run extension ${JSON.stringify(extension.id)}: no manifest found`)
    }
    // TODO!(sqs): probably not needed:
    //
    // if (isErrorLike(extension.manifest)) {
    //     throw new Error(
    //         `unable to run extension ${JSON.stringify(extension.id)}: invalid manifest: ${extension.manifest.message}`
    //     )
    // }
    if (!extension.manifest.url) {
        throw new Error(`unable to run extension ${JSON.stringify(extension.id)}: no "url" property in manifest`)
    }
    return extension.manifest.url
}
