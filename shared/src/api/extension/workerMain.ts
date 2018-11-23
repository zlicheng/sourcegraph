import { createWebWorkerMessageTransports } from '../protocol/jsonrpc2/transports/webWorker'
import { startExtensionHost } from './extensionHost'

/**
 * The entrypoint for the JavaScript context that runs the extension host (and all extensions).
 *
 * To initialize the worker and start the extension host, the parent sends it an {@link InitData}
 * message.
 */
// TODO!(sqs): rename this file to use the "execution context" nomenclature (not "worker" as in "web
// worker")
export function extensionHostMain(): void {
    try {
        const { unsubscribe } = startExtensionHost(createWebWorkerMessageTransports())
        self.addEventListener('unload', () => unsubscribe())
    } catch (err) {
        console.error('Error starting the extension host:', err)
        self.close()
    }
}
