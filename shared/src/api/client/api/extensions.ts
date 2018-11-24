import { Observable, Subscription } from 'rxjs'
import { bufferCount, distinctUntilChanged, map, startWith } from 'rxjs/operators'
import { createProxyAndHandleRequests } from '../../common/proxy'
import { ExtExtensionsAPI } from '../../extension/api/extensions'
import { Connection } from '../../protocol/jsonrpc2/connection'
import { isEqual } from '../../util'
import { Extension } from '../extension'

interface ExtensionToActivate extends Pick<Extension, 'id'> {
    /** The URL to the JavaScript bundle of the extension. */
    scriptURL: string
}

/** @internal */
export class ClientExtensions {
    private subscriptions = new Subscription()
    private proxy: ExtExtensionsAPI

    /**
     * Implements the client side of the extensions API.
     *
     * @param connection The connection to the extension host.
     * @param extensions An observable that emits the set of extensions that should be activated
     * upon subscription and whenever it changes.
     */
    constructor(connection: Connection, extensions: Observable<ExtensionToActivate[] | null>) {
        this.proxy = createProxyAndHandleRequests('extensions', connection, this)

        this.subscriptions.add(
            extensions
                .pipe(
                    map(extensions => (extensions === null || extensions.length === 0 ? null : extensions)),
                    startWith(null),
                    distinctUntilChanged(),
                    bufferCount(2)
                )
                .subscribe(([oldExtensions, newExtensions]) => {
                    // Diff next state's activated extensions vs. current state's.
                    const toActivate = newExtensions || []
                    const toDeactivate: ExtensionToActivate[] = []
                    const next: ExtensionToActivate[] = []
                    if (oldExtensions) {
                        for (const x of oldExtensions) {
                            const newIndex = toActivate.findIndex(({ id }) => isEqual(x.id, id))
                            if (newIndex === -1) {
                                // Extension is no longer activated
                                toDeactivate.push(x)
                            } else {
                                // Extension is already activated.
                                toActivate.splice(newIndex, 1)
                                next.push(x)
                            }
                        }
                    }

                    // Deactivate extensions that are no longer in use.
                    for (const x of toDeactivate) {
                        this.proxy.$deactivateExtension(x.id).catch(err => {
                            console.warn(`Error deactivating extension ${JSON.stringify(x.id)}:`, err)
                        })
                    }

                    // Activate extensions that haven't yet been activated.
                    for (const x of toActivate) {
                        this.proxy
                            .$activateExtension(x.id, x.scriptURL)
                            .catch(err => console.error(`Error activating extension ${JSON.stringify(x.id)}:`, err))
                    }
                })
        )
    }

    public unsubscribe(): void {
        this.subscriptions.unsubscribe()
    }
}

// TODO!(sqs): reintroduce this
//
// /**
//  * Filter the environment to omit extensions that should not be activated (based on their manifest's
//  * activationEvents).
//  */
// function environmentFilter(
//     nextEnvironment: Environment<ConfiguredExtension, SettingsCascade>
// ): Environment<ConfiguredExtension, SettingsCascade> {
//     return {
//         ...nextEnvironment,
//         extensions:
//             nextEnvironment.extensions &&
//             nextEnvironment.extensions.filter(x => {
//                 try {
//                     if (!isExtensionEnabled(nextEnvironment.configuration.final, x.id)) {
//                         return false
//                     } else if (!x.manifest) {
//                         console.warn(
//                             `Extension ${x.id} was not found. Remove it from settings to suppress this warning.`
//                         )
//                         return false
//                     } else if (isErrorLike(x.manifest)) {
//                         console.warn(asError(x.manifest))
//                         return false
//                     } else if (!x.manifest.activationEvents) {
//                         console.warn(`Extension ${x.id} has no activation events, so it will never be activated.`)
//                         return false
//                     }
//                     const visibleTextDocumentLanguages = nextEnvironment.visibleTextDocuments
//                         ? nextEnvironment.visibleTextDocuments.map(({ languageId }) => languageId)
//                         : []
//                     return x.manifest.activationEvents.some(
//                         e => e === '*' || visibleTextDocumentLanguages.some(l => e === `onLanguage:${l}`)
//                     )
//                 } catch (err) {
//                     console.error(err)
//                 }
//                 return false
//             }),
//     }
// }
