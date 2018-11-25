import { BehaviorSubject, of } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { createExtensionHostClient, ExtensionHostClient } from '../client/client'
import { Environment } from '../client/environment'
import { Services } from '../client/services'
import { InitData, startExtensionHost } from '../extension/extensionHost'
import { createConnection } from '../protocol/jsonrpc2/connection'
import { createMessageTransports } from '../protocol/jsonrpc2/helpers.test'

const FIXTURE_ENVIRONMENT: Environment = {
    roots: [{ uri: 'file:///' }],
    visibleTextDocuments: [
        {
            uri: 'file:///f',
            languageId: 'l',
            text: 't',
        },
    ],
    extensions: [{ id: 'x', manifest: null, rawManifest: null }],
    configuration: { final: { a: 1 }, subjects: [] },
    context: {},
}

interface TestContext {
    client: ExtensionHostClient
    extensionHost: typeof sourcegraph
}

/**
 * Set up a new client-extension integration test.
 *
 * @internal
 */
export async function integrationTestContext(): Promise<
    TestContext & {
        environment: BehaviorSubject<Environment>
        services: Services
    }
> {
    const [clientTransports, serverTransports] = createMessageTransports()

    const extensionHost = startExtensionHost(serverTransports)

    const environment = new BehaviorSubject<Environment>(FIXTURE_ENVIRONMENT)
    const services = new Services(environment)
    const client = createExtensionHostClient(
        environment,
        services,
        of(clientTransports).pipe(
            switchMap(async clientTransports => {
                const connection = createConnection(clientTransports)
                connection.listen()

                const initData: InitData = {
                    sourcegraphURL: 'https://example.com',
                    clientApplication: 'sourcegraph',
                }
                await connection.sendRequest('initialize', [initData])
                return connection
            })
        )
    )

    // Ack all settings updates.
    services.settings.updates.subscribe(({ resolve }) => resolve(Promise.resolve()))

    await (await extensionHost.__testAPI).internal.sync()

    // Wait for client to be ready.
    //
    // await clientController.clientEntries
    //     .pipe(
    //         filter(entries => entries.length > 0),
    //         first()
    //     )
    //     .toPromise()

    return {
        client,
        extensionHost: await extensionHost.__testAPI,
        services,
        environment,
    }
}

/**
 * Returns a {@link Promise} and a function. The {@link Promise} blocks until the returned function is called.
 *
 * @internal
 */
export function createBarrier(): { wait: Promise<void>; done: () => void } {
    let done!: () => void
    const wait = new Promise<void>(resolve => (done = resolve))
    return { wait, done }
}

export function collectSubscribableValues<T>(subscribable: sourcegraph.Subscribable<T>): T[] {
    const values: T[] = []
    subscribable.subscribe(value => values.push(value))
    return values
}
