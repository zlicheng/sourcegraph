import { Observable, Subscription } from 'rxjs'
import { bufferCount, distinctUntilChanged, map, startWith } from 'rxjs/operators'
import { createProxyAndHandleRequests } from '../../common/proxy'
import { ExtExtensionsAPI } from '../../extension/api/extensions'
import { Connection } from '../../protocol/jsonrpc2/connection'
import { isEqual } from '../../util'
import { Environment } from '../environment'
import { Extension } from '../extension'

/** @internal */
export class ClientExtensions<X extends Extension> {
    private subscriptions = new Subscription()
    private proxy: ExtExtensionsAPI

    /**
     * Implements the client side of the extensions API.
     *
     * @param connection The connection to the extension host.
     * @param extensions An observable that emits the set of activated extensions upon subscription
     * and whenever it changes.
     */
    constructor(connection: Connection, extensions: Observable<Environment<X>['extensions']>) {
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
                    const toDeactivate: X[] = []
                    const next: X[] = []
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
                        // TODO!(sqs): safely catch errors etc.
                        // x.deactivate()
                        throw new Error('not yet implemented TODO!(sqs) deactivate: ' + x.id)
                    }

                    // Activate extensions that haven't yet been activated.
                    for (const x of toActivate) {
                        console.log('TODO!(sqs) 3742371 activate extension', x.id)
                        this.activateExtension(x).catch(err => console.error('TODO!(sqs) 394832', err))
                    }
                })
        )
    }

    private async activateExtension(extension: X): Promise<void> {
        // TODO!(sqs): remove cast
        await this.proxy.$activateExtension((extension as any).manifest.url)
    }

    public unsubscribe(): void {
        this.subscriptions.unsubscribe()
    }
}
