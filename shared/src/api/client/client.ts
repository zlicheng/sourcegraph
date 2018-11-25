import { BehaviorSubject, Observable, of, Subject, Subscription, Unsubscribable } from 'rxjs'
import { finalize, first, map } from 'rxjs/operators'
import {
    ConfigurationUpdateParams,
    LogMessageParams,
    MessageActionItem,
    ShowInputParams,
    ShowMessageParams,
    ShowMessageRequestParams,
} from '../protocol'
import { Connection } from '../protocol/jsonrpc2/connection'
import { createExtensionHostClientConnection } from './connection'
import { Environment } from './environment'
import { Registries } from './registries'

interface PromiseCallback<T> {
    resolve: (p: T | Promise<T>) => void
}

type ShowMessageRequest = ShowMessageRequestParams & PromiseCallback<MessageActionItem | null>

type ShowInputRequest = ShowInputParams & PromiseCallback<string | null>

export type ConfigurationUpdate = ConfigurationUpdateParams & PromiseCallback<void>

export interface ExtensionHostClientObservables {
    // TODO!(sqs): make not subjects but just observables

    /** Log messages from extensions. */
    readonly logMessages: Subject<LogMessageParams>

    /** Messages from extensions intended for display to the user. */
    readonly showMessages: Subject<ShowMessageParams>

    /** Messages from extensions requesting the user to select an action. */
    readonly showMessageRequests: Subject<ShowMessageRequest>

    /** Messages from extensions requesting text input from the user. */
    readonly showInputs: Subject<ShowInputRequest>

    /** Configuration updates from extensions. */
    readonly configurationUpdates: Subject<ConfigurationUpdate>
}

export interface ExtensionHostClient extends ExtensionHostClientObservables, Unsubscribable {
    /** @internal */
    readonly ready: Promise<void>

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
    registries: Registries,
    extensionHostConnection: Observable<Connection>
): ExtensionHostClient {
    const subscriptions = new Subscription()
    const observables: ExtensionHostClientObservables = {
        logMessages: new Subject<LogMessageParams>(),
        showMessages: new Subject<ShowMessageParams>(),
        showMessageRequests: new Subject<ShowMessageRequest>(),
        showInputs: new Subject<ShowInputRequest>(),
        configurationUpdates: new Subject<ConfigurationUpdate>(),
    }
    const connection = extensionHostConnection.pipe(
        map(connection => {
            const client = createExtensionHostClientConnection(connection, environment, registries, observables)
            return of(client).pipe(finalize(() => client.unsubscribe()))
        })
    )
    subscriptions.add(connection.subscribe())
    return {
        ...observables,
        ready: connection.pipe(first()).toPromise<any>(),
        unsubscribe: () => subscriptions.unsubscribe(),
    }
}
