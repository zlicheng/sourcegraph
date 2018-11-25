import * as assert from 'assert'
import { take } from 'rxjs/operators'
import { integrationTestContext } from './helpers.test'

describe('search (integration)', () => {
    it('registers a query transformer', async () => {
        const { registries, extensionHost } = await integrationTestContext()

        // Register the provider and call it
        const unsubscribe = extensionHost.search.registerQueryTransformer({ transformQuery: () => 'bar' })
        await extensionHost.internal.sync()
        assert.deepStrictEqual(
            await registries.queryTransformer
                .transformQuery('foo')
                .pipe(take(1))
                .toPromise(),
            'bar'
        )

        // Unregister the provider and ensure it's removed.
        unsubscribe.unsubscribe()
        assert.deepStrictEqual(
            await registries.queryTransformer
                .transformQuery('foo')
                .pipe(take(1))
                .toPromise(),
            'foo'
        )
    })

    it('supports multiple query transformers', async () => {
        const { registries, extensionHost } = await integrationTestContext()

        // Register the provider and call it
        extensionHost.search.registerQueryTransformer({ transformQuery: q => `${q} bar` })
        extensionHost.search.registerQueryTransformer({ transformQuery: q => `${q} qux` })
        await extensionHost.internal.sync()
        assert.deepStrictEqual(
            await registries.queryTransformer
                .transformQuery('foo')
                .pipe(take(1))
                .toPromise(),
            'foo bar qux'
        )
    })
})
