import { BehaviorSubject, Observable, Unsubscribable } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import { ConfigurationUpdateParams, MessageActionItem, ShowInputParams, ShowMessageRequestParams } from '../protocol'
import { Connection } from '../protocol/jsonrpc2/connection'
import { createExtensionHostClientConnection, ExtensionHostClientConnection } from './connection'
import { Environment } from './environment'
import { Services } from './services'

interface PromiseCallback<T> {
    resolve: (p: T | Promise<T>) => void
}

// TODO!(sqs): unexport some of these (maybe by moving to other files)
export type ShowMessageRequest = ShowMessageRequestParams & PromiseCallback<MessageActionItem | null>

export type ShowInputRequest = ShowInputParams & PromiseCallback<string | null>

export type ConfigurationUpdate = ConfigurationUpdateParams & PromiseCallback<void>

export interface ExtensionHostClient extends Unsubscribable {
    /**
     * Closes the connection to the extension host and stops the controller from reestablishing new
     * connections.
     */
    unsubscribe(): void
}

/**
 * The client. TODO!(sqs), make this for all shared code and the internal "extension" API, not just
 * cross-context extensions.
 *
 * @param extensionHostConnection An observable that emits at most once (TODO!(sqs): or multiple
 * times? to handle connection drops/reestablishments).
 */
export function createExtensionHostClient(
    // TODO!(sqs): make it possible to just use an observable of environment, not
    // behaviorsubject, to simplify data flow
    environment: BehaviorSubject<Environment>,
    services: Services,
    extensionHostConnection: Observable<Connection>
): ExtensionHostClient {
    const subscription = extensionHostConnection
        .pipe(
            switchMap(connection => {
                const client = createExtensionHostClientConnection(connection, environment, services)
                return new Observable<ExtensionHostClientConnection>(sub => {
                    sub.next(client)
                    return () => client.unsubscribe()
                })
            })
        )
        .subscribe()
    return {
        unsubscribe: () => subscription.unsubscribe(),
    }
}
