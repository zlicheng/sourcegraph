import { Subscription, Unsubscribable } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { createProxy, handleRequests } from '../common/proxy'
import { Connection, createConnection, Logger, MessageTransports } from '../protocol/jsonrpc2/connection'
import { ExtCommands } from './api/commands'
import { ExtConfiguration } from './api/configuration'
import { ExtContext } from './api/context'
import { ExtDocuments } from './api/documents'
import { ExtExtensions } from './api/extensions'
import { ExtLanguageFeatures } from './api/languageFeatures'
import { ExtRoots } from './api/roots'
import { ExtSearch } from './api/search'
import { ExtViews } from './api/views'
import { ExtWindows } from './api/windows'
import { Location } from './types/location'
import { Position } from './types/position'
import { Range } from './types/range'
import { Selection } from './types/selection'
import { URI } from './types/uri'

const consoleLogger: Logger = {
    error(message: string): void {
        console.error(message)
    },
    warn(message: string): void {
        console.warn(message)
    },
    info(message: string): void {
        console.info(message)
    },
    log(message: string): void {
        console.log(message)
    },
}

/**
 * Required information when initializing an extension host.
 */
export interface InitData {
    /** @see {@link module:sourcegraph.internal.sourcegraphURL} */
    sourcegraphURL: string

    /** @see {@link module:sourcegraph.internal.clientApplication} */
    clientApplication: 'sourcegraph' | 'other'
}

/**
 * Starts the extension host, which runs extensions. It is a Web Worker or other similar isolated
 * JavaScript execution context. There is exactly 1 extension host, and it has zero or more
 * extensions activated (and running).
 *
 * It expects to receive a message containing {@link InitData} from the client application as the
 * first message.
 *
 * @param transports The message reader and writer to use for communication with the client.
 * @return An unsubscribable to terminate the extension host.
 */
export function startExtensionHost(transports: MessageTransports): Unsubscribable {
    const connection = createConnection(transports, consoleLogger)
    connection.listen()

    const subscription = new Subscription()
    subscription.add(connection)

    // Wait for "initialize" message from client application before proceeding to create the
    // extension host.
    let initialized = false
    connection.onRequest('initialize', (initData: InitData) => {
        if (initialized) {
            throw new Error('extension host is already initialized')
        }
        initialized = true
        subscription.add(createExtensionHost(connection, initData))
    })

    return subscription
}

/**
 * Initializes the extension host using the {@link InitData} from the client application. It is
 * called by {@link startExtensionHost} after the {@link InitData} is received.
 *
 * @param connection The connection used to communicate with the client.
 * @param initData The information to initialize this extension host.
 * @return An unsubscribable to terminate the extension host.
 */
function createExtensionHost(connection: Connection, initData: InitData): Unsubscribable {
    // Make `import 'sourcegraph'` or `require('sourcegraph')` return the extension API.
    const api = createExtensionAPI(initData, connection)
    ;(self as any).require = (modulePath: string): any => {
        if (modulePath === 'sourcegraph') {
            return api
        }
        // All other requires/imports in the extension's code should not reach here because their JS
        // bundler should have resolved them locally.
        throw new Error(`require: module not found: ${modulePath}`)
    }

    const subscription = new Subscription()

    // Activate extensions when requested.
    //
    // TODO!(sqs): add type for initialize request
    //
    // TODO(sqs): add timeouts to prevent long-running activate or deactivate functions from
    // significantly delaying other extensions.
    connection.onRequest('activateExtension', async (bundleURL: string) => {
        const { activation, deactivate } = activateExtension(bundleURL)
        const extensionSubscription = new Subscription(deactivate)
        try {
            await activation
        } catch (err) {
            // Deactivate the extension if an error was thrown, in case the extension was partially
            // activated and acquired resources that should be released. The deactivate function
            // might not be robust to being called when the extension was only partially activated,
            // which might mean that it would not release all of the resources that were acquired
            // (but it's still better than not running it at all).
            await deactivate()
            throw err
        }

        // Deactivate the extension when the extension host terminates. There is no guarantee that this
        // is called or that execution continues until it is finshed (i.e., the JavaScript execution
        // context may be terminated before deactivation is completed).
        subscription.add(extensionSubscription)
    })

    return subscription
}

function createExtensionAPI(initData: InitData, connection: Connection): typeof sourcegraph {
    // For debugging/tests.
    const sync = () => connection.sendRequest<void>('ping')
    connection.onRequest('ping', () => 'pong')

    const context = new ExtContext(createProxy(connection, 'context'))
    handleRequests(connection, 'context', context)

    const documents = new ExtDocuments(sync)
    handleRequests(connection, 'documents', documents)

    const extensions = new ExtExtensions()
    handleRequests(connection, 'extensions', extensions)

    const roots = new ExtRoots()
    handleRequests(connection, 'roots', roots)

    const windows = new ExtWindows(createProxy(connection, 'windows'), createProxy(connection, 'codeEditor'), documents)
    handleRequests(connection, 'windows', windows)

    const views = new ExtViews(createProxy(connection, 'views'))
    handleRequests(connection, 'views', views)

    const configuration = new ExtConfiguration<any>(createProxy(connection, 'configuration'))
    handleRequests(connection, 'configuration', configuration)

    const languageFeatures = new ExtLanguageFeatures(createProxy(connection, 'languageFeatures'), documents)
    handleRequests(connection, 'languageFeatures', languageFeatures)

    const search = new ExtSearch(createProxy(connection, 'search'))
    handleRequests(connection, 'search', search)

    const commands = new ExtCommands(createProxy(connection, 'commands'))
    handleRequests(connection, 'commands', commands)

    return {
        URI,
        Position,
        Range,
        Selection,
        Location,
        MarkupKind: {
            // The const enum MarkupKind values can't be used because then the `sourcegraph` module import at the
            // top of the file is emitted in the generated code. That is problematic because it hasn't been defined
            // yet (in workerMain.ts). It seems that using const enums should *not* emit an import in the generated
            // code; this is a known issue: https://github.com/Microsoft/TypeScript/issues/16671
            // https://github.com/palantir/tslint/issues/1798 https://github.com/Microsoft/TypeScript/issues/18644.
            PlainText: 'plaintext' as sourcegraph.MarkupKind.PlainText,
            Markdown: 'markdown' as sourcegraph.MarkupKind.Markdown,
        },

        app: {
            get activeWindow(): sourcegraph.Window | undefined {
                return windows.getActive()
            },
            get windows(): sourcegraph.Window[] {
                return windows.getAll()
            },
            createPanelView: id => views.createPanelView(id),
        },

        workspace: {
            get textDocuments(): sourcegraph.TextDocument[] {
                return documents.getAll()
            },
            onDidOpenTextDocument: documents.onDidOpenTextDocument,
            get roots(): ReadonlyArray<sourcegraph.WorkspaceRoot> {
                return roots.getAll()
            },
            onDidChangeRoots: roots.onDidChange,
        },

        configuration: {
            get: () => configuration.get(),
            subscribe: next => configuration.subscribe(next),
        },

        languages: {
            registerHoverProvider: (selector, provider) => languageFeatures.registerHoverProvider(selector, provider),
            registerDefinitionProvider: (selector, provider) =>
                languageFeatures.registerDefinitionProvider(selector, provider),
            registerTypeDefinitionProvider: (selector, provider) =>
                languageFeatures.registerTypeDefinitionProvider(selector, provider),
            registerImplementationProvider: (selector, provider) =>
                languageFeatures.registerImplementationProvider(selector, provider),
            registerReferenceProvider: (selector, provider) =>
                languageFeatures.registerReferenceProvider(selector, provider),
        },

        search: {
            registerQueryTransformer: provider => search.registerQueryTransformer(provider),
        },

        commands: {
            registerCommand: (command, callback) => commands.registerCommand({ command, callback }),
            executeCommand: (command, ...args) => commands.executeCommand(command, args),
        },

        internal: {
            sync,
            updateContext: updates => context.updateContext(updates),
            sourcegraphURL: new URI(initData.sourcegraphURL),
            clientApplication: initData.clientApplication,
        },
    }
}
