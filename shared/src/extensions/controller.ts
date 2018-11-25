import { BehaviorSubject, from, Observable, Subject, Subscription, Unsubscribable } from 'rxjs'
import { filter, map, mergeMap, share, switchMap } from 'rxjs/operators'
import { createExtensionHostClient } from '../api/client/client'
import { Environment } from '../api/client/environment'
import { Services } from '../api/client/services'
import { ExecuteCommandParams } from '../api/client/services/command'
import { ContributionRegistry } from '../api/client/services/contribution'
import { MessageType } from '../api/client/services/notifications'
import { InitData } from '../api/extension/extensionHost'
import { Contributions } from '../api/protocol'
import { createConnection } from '../api/protocol/jsonrpc2/connection'
import { registerBuiltinClientCommands, updateConfiguration } from '../commands/commands'
import { Notification } from '../notifications/notification'
import { PlatformContext } from '../platform/context'
import { isErrorLike } from '../util/errors'
import { ConfiguredExtension } from './extension'
import { ExtensionManifest } from './extensionManifest'

export interface Controller extends Unsubscribable {
    /**
     * Global notification messages that should be displayed to the user, from the following sources:
     *
     * - window/showMessage notifications from extensions
     * - Errors thrown or returned in command invocation
     */
    readonly notifications: Observable<Notification>

    services: Services

    /**
     * Executes the command (registered in the CommandRegistry) specified in params. If an error is thrown, the
     * error is returned *and* emitted on the {@link Controller#notifications} observable.
     *
     * All callers should execute commands using this method instead of calling
     * {@link sourcegraph:CommandRegistry#executeCommand} directly (to ensure errors are
     * emitted as notifications).
     */
    executeCommand(params: ExecuteCommandParams): Promise<any>

    /**
     * Frees all resources associated with this client.
     */
    unsubscribe(): void
}

/**
 * React props or state containing the client. There should be only a single client for the whole
 * application.
 */
export interface ExtensionsControllerProps {
    /**
     * The client, which is used to communicate with the extensions and manages extensions based on the
     * environment.
     */
    extensionsController: Controller
}

/**
 * TODO!(sqs): clean this up
 *
 * Creates the controller, which handles all communication between the client application and
 * extensions.
 *
 * There should only be a single client for the entire client application. The client's
 * environment represents all of the client application state that the client needs to know.
 *
 * It receives state updates via calls to the setEnvironment method. It provides functionality and
 * results via its services and the showMessages, etc., observables.
 *
 * TODO!(sqs): move environment out of here
 */
export function createController(
    context: PlatformContext,
    environment: BehaviorSubject<Environment<ConfiguredExtension>>
): Controller {
    const subscriptions = new Subscription()

    const services = new Services(environment)
    const extensionHostConnection = context.createExtensionHost().pipe(
        switchMap(async messageTransports => {
            const connection = createConnection(messageTransports)
            connection.listen()

            const initData: InitData = {
                sourcegraphURL: context.sourcegraphURL,
                clientApplication: context.clientApplication,
            }
            await connection.sendRequest('initialize', [initData])
            return connection
        }),
        share()
    )
    const client = createExtensionHostClient(environment, services, extensionHostConnection)
    subscriptions.add(client)

    const notifications = new Subject<Notification>()

    // TODO!(sqs): reintroduce
    //
    // Apply trace settings.
    //
    // HACK(sqs): This is inefficient and doesn't unsubscribe itself.
    // client.clientEntries.subscribe(entries => {
    //     const traceEnabled = localStorage.getItem(ExtensionStatus.TRACE_STORAGE_KEY) !== null
    //     for (const e of entries) {
    //         e.connection
    //             .then(c => c.trace(traceEnabled ? Trace.Verbose : Trace.Off, new BrowserConsoleTracer(e.key.id)))
    //             .catch(err => console.error(err))
    //     }
    // })

    subscriptions.add(registerBuiltinClientCommands(context, services.commands))
    subscriptions.add(registerExtensionContributions(services.contribution, environment))

    // Show messages (that don't need user input) as global notifications.
    subscriptions.add(
        services.notifications.showMessages.subscribe(({ message, type }) => notifications.next({ message, type }))
    )

    function messageFromExtension(message: string): string {
        return `From extension:\n\n${message}`
    }
    subscriptions.add(
        services.notifications.showMessageRequests.subscribe(({ message, actions, resolve }) => {
            if (!actions || actions.length === 0) {
                alert(messageFromExtension(message))
                resolve(null)
                return
            }
            const value = prompt(
                messageFromExtension(
                    `${message}\n\nValid responses: ${actions.map(({ title }) => JSON.stringify(title)).join(', ')}`
                ),
                actions[0].title
            )
            resolve(actions.find(a => a.title === value) || null)
        })
    )
    subscriptions.add(
        services.notifications.showInputs.subscribe(({ message, defaultValue, resolve }) =>
            resolve(prompt(messageFromExtension(message), defaultValue))
        )
    )
    subscriptions.add(
        services.settings.updates
            .pipe(
                mergeMap(params => {
                    const update = updateConfiguration(context, params)
                    params.resolve(update)
                    return from(update)
                })
            )
            .subscribe(undefined, err => console.error(err))
    )

    // Print window/logMessage log messages to the browser devtools console.
    subscriptions.add(
        services.notifications.logMessages.subscribe(({ message }) => {
            log('info', 'EXT', message)
        })
    )

    // Debug helpers.
    const DEBUG = true
    if (DEBUG) {
        // Debug helper: log environment changes.
        const LOG_ENVIRONMENT = false
        if (LOG_ENVIRONMENT) {
            subscriptions.add(environment.subscribe(environment => log('info', 'env', environment)))
        }

        // Debug helpers: e.g., just run `sx` in devtools to get a reference to this client. (If multiple
        // controllers are created, this points to the last one created.)
        ;(window as any).sx = client
        // This value is synchronously available because observable has an underlying
        // BehaviorSubject source.
        subscriptions.add(environment.subscribe(v => ((window as any).sxenv = v)))
    }

    return {
        notifications,
        services,
        executeCommand: params =>
            services.commands.executeCommand(params).catch(err => {
                notifications.next({ message: err, type: MessageType.Error, source: params.command })
                return Promise.reject(err)
            }),
        unsubscribe: () => subscriptions.unsubscribe(),
    }
}

function registerExtensionContributions(
    contributionRegistry: ContributionRegistry,
    environment: Observable<Environment<ConfiguredExtension>>
): Unsubscribable {
    const contributions = environment.pipe(
        map(({ extensions }) => extensions),
        filter((extensions): extensions is ConfiguredExtension[] => !!extensions),
        map(extensions =>
            extensions
                .map(({ manifest }) => manifest)
                .filter((manifest): manifest is ExtensionManifest => manifest !== null && !isErrorLike(manifest))
                .map(({ contributes }) => contributes)
                .filter((contributions): contributions is Contributions => !!contributions)
        )
    )
    return contributionRegistry.registerContributions({
        contributions,
    })
}

/** Prints a nicely formatted console log or error message. */
function log(level: 'info' | 'error', subject: string, message: any, other?: { [name: string]: any }): void {
    let f: typeof console.log
    let color: string
    let backgroundColor: string
    if (level === 'info') {
        f = console.log
        color = '#000'
        backgroundColor = '#eee'
    } else {
        f = console.error
        color = 'white'
        backgroundColor = 'red'
    }
    f(
        '%c EXT %s %c',
        `font-weight:bold;background-color:${backgroundColor};color:${color}`,
        subject,
        'font-weight:normal;background-color:unset',
        message,
        other || ''
    )
}
