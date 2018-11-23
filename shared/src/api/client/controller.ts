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

    /**
     * Called before applying the next environment in Controller#setEnvironment. It should have no side effects.
     */
    environmentFilter?(nextEnvironment: Environment<X, C>): Environment<X, C>
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

    /**
     * Returns the script URL suitable for passing to importScripts for an extension's bundle.
     *
     * This is necessary because some platforms (such as Chrome extensions) use a script-src CSP
     * that would prevent loading bundles from arbitrary URLs, which requires us to pass blob: URIs
     * to importScripts.
     *
     * @param extension The extension whose script URL to get.
     * @return A script URL suitable for passing to importScripts, typically either the original
     * https:// URL for the extension's bundle or a blob: URI for it.
     */
    getScriptURLForExtension(extension: X): string | Promise<string>
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

    // TODO!(sqs): extract, remove any cast
    public getScriptURLForExtension(extension: X): string {
        return (extension as any).manifest.url // TODO!(sqs)
    }

    constructor(private options: ControllerOptions<X, C>) {
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
