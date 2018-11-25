import assert from 'assert'
import { map } from 'rxjs/operators'
import { Window } from 'sourcegraph'
import { assertToJSON } from '../extension/types/common.test'
import { MessageType } from '../protocol'
import { collectSubscribableValues, integrationTestContext } from './helpers.test'

describe('Windows (integration)', () => {
    describe('app.activeWindow', () => {
        it('returns the active window', async () => {
            const { extensionHost, ready } = await integrationTestContext()
            await ready
            assertToJSON(extensionHost.app.activeWindow, {
                visibleViewComponents: [
                    {
                        type: 'CodeEditor' as 'CodeEditor',
                        document: { uri: 'file:///f', languageId: 'l', text: 't' },
                    },
                ],
            } as Window)
        })
    })

    describe('app.windows', () => {
        it('lists windows', async () => {
            const { extensionHost, ready } = await integrationTestContext()
            await ready
            assertToJSON(extensionHost.app.windows, [
                {
                    visibleViewComponents: [
                        {
                            type: 'CodeEditor' as 'CodeEditor',
                            document: { uri: 'file:///f', languageId: 'l', text: 't' },
                        },
                    ],
                },
            ] as Window[])
        })

        it('adds new text documents', async () => {
            const { environment, extensionHost, getEnvironment, ready } = await integrationTestContext()

            environment.next({
                ...getEnvironment(),
                visibleTextDocuments: [{ uri: 'file:///f2', languageId: 'l2', text: 't2' }],
            })

            await ready
            assertToJSON(extensionHost.app.windows, [
                {
                    visibleViewComponents: [
                        {
                            type: 'CodeEditor' as 'CodeEditor',
                            document: { uri: 'file:///f2', languageId: 'l2', text: 't2' },
                        },
                    ],
                },
            ] as Window[])
        })
    })

    describe('Window', () => {
        it('Window#showNotification', async () => {
            const { client, extensionHost, ready } = await integrationTestContext()
            await ready
            const values = collectSubscribableValues(client.showMessages)
            extensionHost.app.activeWindow!.showNotification('a') // tslint:disable-line deprecation
            await extensionHost.internal.sync()
            assert.deepStrictEqual(values, [{ message: 'a', type: MessageType.Info }] as typeof values)
        })

        it('Window#showMessage', async () => {
            const { client, extensionHost, ready } = await integrationTestContext()
            client.showMessageRequests.subscribe(({ resolve }) => resolve(Promise.resolve(null)))
            await ready
            const values = collectSubscribableValues(
                client.showMessageRequests.pipe(map(({ message, type }) => ({ message, type })))
            )
            assert.strictEqual(await extensionHost.app.activeWindow!.showMessage('a'), null)
            assert.deepStrictEqual(values, [{ message: 'a', type: MessageType.Info }] as typeof values)
        })

        it('Window#showInputBox', async () => {
            const { client, extensionHost, ready } = await integrationTestContext()
            client.showInputs.subscribe(({ resolve }) => resolve(Promise.resolve('c')))
            await ready
            const values = collectSubscribableValues(
                client.showInputs.pipe(map(({ message, defaultValue }) => ({ message, defaultValue })))
            )
            assert.strictEqual(await extensionHost.app.activeWindow!.showInputBox({ prompt: 'a', value: 'b' }), 'c')
            assert.deepStrictEqual(values, [{ message: 'a', defaultValue: 'b' }] as typeof values)
        })
    })
})
