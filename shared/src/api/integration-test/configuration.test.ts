import * as assert from 'assert'
import { map } from 'rxjs/operators'
import { SettingsUpdate } from '../client/services/settings'
import { assertToJSON } from '../extension/types/common.test'
import { collectSubscribableValues, integrationTestContext } from './helpers.test'

describe('Configuration (integration)', () => {
    it('is usable in synchronous activation functions', async () => {
        const { extensionHost } = await integrationTestContext()
        assert.doesNotThrow(() => extensionHost.configuration.subscribe(() => void 0))
        assert.doesNotThrow(() => extensionHost.configuration.get())
    })

    describe('Configuration#get', () => {
        it('gets configuration', async () => {
            const { extensionHost } = await integrationTestContext()
            assertToJSON(extensionHost.configuration.get(), { a: 1 })
            assert.deepStrictEqual(extensionHost.configuration.get().value, { a: 1 })
        })
    })

    describe('Configuration#update', () => {
        it('updates configuration', async () => {
            const { extensionHost, services } = await integrationTestContext()

            const values = collectSubscribableValues(
                services.settings.updates.pipe(map(({ path, value }) => ({ path, value })))
            )

            await extensionHost.configuration.get().update('a', 2)
            await extensionHost.internal.sync()
            assert.deepStrictEqual(values, [{ path: ['a'], value: 2 }] as SettingsUpdate[])
            values.length = 0 // clear

            await extensionHost.configuration.get().update('a', 3)
            await extensionHost.internal.sync()
            assert.deepStrictEqual(values, [{ path: ['a'], value: 3 }] as SettingsUpdate[])
        })
    })

    describe('configuration.subscribe', () => {
        it('subscribes to changes', async () => {
            const { environment, extensionHost } = await integrationTestContext()

            let calls = 0
            extensionHost.configuration.subscribe(() => calls++)
            assert.strictEqual(calls, 1) // called initially

            environment.next({
                ...environment.value,
                configuration: { final: { a: 3 }, subjects: [] },
            })
            await extensionHost.internal.sync()
            assert.strictEqual(calls, 2)
        })
    })
})
