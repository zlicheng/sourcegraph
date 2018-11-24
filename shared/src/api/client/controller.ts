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
import { isEqual } from '../util'
import { createExtensionHostClient } from './client'
import { EMPTY_CONTEXT } from './context/context'
import { EMPTY_ENVIRONMENT, Environment } from './environment'
import { Extension } from './extension'
import { Registries } from './registries'

interface PromiseCallback<T> {
    resolve: (p: T | Promise<T>) => void
}

type ShowMessageRequest = ShowMessageRequestParams & PromiseCallback<MessageActionItem | null>

type ShowInputRequest = ShowInputParams & PromiseCallback<string | null>

export type ConfigurationUpdate = ConfigurationUpdateParams & PromiseCallback<void>

/**
 * Options for creating the controller.
 *
 * @template X extension type
 * @template C settings cascade type
 */
export interface ControllerOptions<X extends Extension, C extends SettingsCascade> {
    /**
     * @returns An observable that emits at most once (TODO!(sqs): or multiple times? to handle connection drops/reestablishments).
     */
    connectToExtensionHost(): Observable<Connection>
}

export interface ControllerHelpers<X extends Extension> {
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
 * The controller. TODO!(sqs), make this for all shared code and the internal "extension" API, not
 * just cross-context extensions.
 *
 * @template X extension type
 * @template C settings cascade type
 */
export class Controller<X extends Extension, C extends SettingsCascade>
    implements ControllerHelpers<X>, Unsubscribable {
    private _environment = new BehaviorSubject<Environment<X, C>>(EMPTY_ENVIRONMENT)

    /** The environment. */
    public readonly environment: Observable<Environment<X, C>> = this._environment

    /** An observable that emits whenever the set of clients managed by this controller changes. */
    // TODO!(sqs): implement
    public get clientEntries(): Observable<any[]> {
        return of([])
    }

    private subscriptions = new Subscription()

    /** The registries for various providers that expose extension functionality. */
    public readonly registries: Registries<X, C>

    public readonly logMessages = new Subject<LogMessageParams>()
    public readonly showMessages = new Subject<ShowMessageParams>()
    public readonly showMessageRequests = new Subject<ShowMessageRequest>()
    public readonly showInputs = new Subject<ShowInputRequest>()
    public readonly configurationUpdates = new Subject<ConfigurationUpdate>()

    constructor(options: ControllerOptions<X, C>) {
        this.registries = new Registries<X, C>(this.environment)

        this.subscriptions.add(
            options
                .connectToExtensionHost()
                .pipe(
                    map(connection => {
                        const client = createExtensionHostClient<X, C>(
                            connection,
                            this._environment,
                            this.registries,
                            this
                        )
                        return of(client).pipe(finalize(() => client.unsubscribe()))
                    })
                )
                .subscribe()
        )
    }

    /**
     * Detect when setEnvironment is called within a setEnvironment call, which probably means there is a bug.
     */
    private inSetEnvironment = false

    public setEnvironment(nextEnvironment: Environment<X, C>): void {
        if (this.inSetEnvironment) {
            throw new Error('setEnvironment may not be called recursively')
        }
        this.inSetEnvironment = true

        try {
            // External consumers don't see context, and their setEnvironment args lack context.
            if (nextEnvironment.context === EMPTY_CONTEXT) {
                nextEnvironment = { ...nextEnvironment, context: this._environment.value.context }
            }

            if (isEqual(this._environment.value, nextEnvironment)) {
                this.inSetEnvironment = false
                return // no change
            }

            this._environment.next(nextEnvironment)
        } finally {
            this.inSetEnvironment = false
        }
    }

    public unsubscribe(): void {
        this.subscriptions.unsubscribe()
    }
}
