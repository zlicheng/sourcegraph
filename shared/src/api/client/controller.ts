import { BehaviorSubject, Observable, of, Subject, Subscription, Unsubscribable } from 'rxjs'
import {
    ConfigurationUpdateParams,
    LogMessageParams,
    MessageActionItem,
    SettingsCascade,
    ShowInputParams,
    ShowMessageParams,
    ShowMessageRequestParams,
} from '../protocol'
import { isEqual } from '../util'
import { createExtensionHostClient, ExtensionHostClient, ExtensionHostClient2 } from './client'
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
    connectToExtensionHost(): ExtensionHostClient2

    // TODO!(sqs): remove
    //
    // /** Returns additional options to use when creating a client. */
    // clientOptions: (
    //     key: ExtensionConnectionKey,
    //     extension: X
    // ) => { createMessageTransports: () => MessageTransports | Promise<MessageTransports> }

    /**
     * Called before applying the next environment in Controller#setEnvironment. It should have no side effects.
     */
    environmentFilter?(nextEnvironment: Environment<X, C>): Environment<X, C>
}

export interface ControllerHelpers {
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
 * The controller for the environment.
 *
 * @template X extension type
 * @template C settings cascade type
 */
export class Controller<X extends Extension, C extends SettingsCascade> implements ControllerHelpers, Unsubscribable {
    private _environment = new BehaviorSubject<Environment<X, C>>(EMPTY_ENVIRONMENT)

    /** The environment. */
    public readonly environment: Observable<Environment<X, C>> = this._environment

    /** An observable that emits whenever the set of clients managed by this controller changes. */
    // TODO!(sqs): implement
    public get clientEntries(): Observable<any[]> {
        return of([])
    }

    /**
     * The client application's connection to the extension host.
     */
    private extensionHost: Promise<ExtensionHostClient>

    private subscriptions = new Subscription()

    /** The registries for various providers that expose extension functionality. */
    public readonly registries: Registries<X, C>

    public readonly logMessages = new Subject<LogMessageParams>()
    public readonly showMessages = new Subject<ShowMessageParams>()
    public readonly showMessageRequests = new Subject<ShowMessageRequest>()
    public readonly showInputs = new Subject<ShowInputRequest>()
    public readonly configurationUpdates = new Subject<ConfigurationUpdate>()

    constructor(private options: ControllerOptions<X, C>) {
        this.registries = new Registries<X, C>(this.environment)

        this.extensionHost = options
            .connectToExtensionHost()
            .ready.then(connection =>
                createExtensionHostClient<X, C>(connection, this._environment, this.registries, this)
            )
        this.subscriptions.add(() => {
            // TODO!(sqs): hacky
            this.extensionHost
                .then(extensionHost => extensionHost.unsubscribe())
                .catch(err => console.error('TODO!(sqs) 9832432', err))
        })
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
            if (this.options.environmentFilter) {
                nextEnvironment = this.options.environmentFilter(nextEnvironment)
            }

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
