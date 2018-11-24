import { BehaviorSubject, Observable, of, Subject, Subscription, Unsubscribable } from 'rxjs'
import { finalize, map } from 'rxjs/operators'
import {
    ConfigurationUpdateParams,
    LogMessageParams,
    MessageActionItem,
    SettingsCascade,
    ShowInputParams,
    ShowMessageParams,
    ShowMessageRequestParams,
} from '../protocol'
import { Connection } from '../protocol/jsonrpc2/connection'
import { createExtensionHostClientConnection } from './connection'
import { Environment } from './environment'
import { Extension } from './extension'
import { Registries } from './registries'

interface PromiseCallback<T> {
    resolve: (p: T | Promise<T>) => void
}

type ShowMessageRequest = ShowMessageRequestParams & PromiseCallback<MessageActionItem | null>

type ShowInputRequest = ShowInputParams & PromiseCallback<string | null>

export type ConfigurationUpdate = ConfigurationUpdateParams & PromiseCallback<void>

/**
 * Options for creating the client.
 *
 * @template X extension type
 * @template C settings cascade type
 */
export interface ClientOptions {
    /**
     * @returns An observable that emits at most once (TODO!(sqs): or multiple times? to handle connection drops/reestablishments).
     */
    connectToExtensionHost(): Observable<Connection>
}

export interface ClientHelpers {
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

/**
 * The client. TODO!(sqs), make this for all shared code and the internal "extension" API, not
 * just cross-context extensions.
 *
 * @template X extension type
 * @template C settings cascade type
 */
export class Client<X extends Extension, C extends SettingsCascade> implements ClientHelpers, Unsubscribable {
    /** An observable that emits whenever the set of clients managed by this client changes. */
    // TODO!(sqs): implement
    public get clientEntries(): Observable<any[]> {
        return of([])
    }

    private subscriptions = new Subscription()

    public readonly logMessages = new Subject<LogMessageParams>()
    public readonly showMessages = new Subject<ShowMessageParams>()
    public readonly showMessageRequests = new Subject<ShowMessageRequest>()
    public readonly showInputs = new Subject<ShowInputRequest>()
    public readonly configurationUpdates = new Subject<ConfigurationUpdate>()

    constructor(
        // TODO!(sqs): make it possible to just use an observable of environment, not
        // behaviorsubject, to simplify data flow
        environment: BehaviorSubject<Environment<X, C>>,
        registries: Registries<X, C>,
        extensionHostConnection: Observable<Connection>
    ) {
        this.subscriptions.add(
            extensionHostConnection
                .pipe(
                    map(connection => {
                        const client = createExtensionHostClientConnection<X, C>(
                            connection,
                            environment,
                            registries,
                            this
                        )
                        return of(client).pipe(finalize(() => client.unsubscribe()))
                    })
                )
                .subscribe()
        )
    }

    public unsubscribe(): void {
        this.subscriptions.unsubscribe()
    }
}
