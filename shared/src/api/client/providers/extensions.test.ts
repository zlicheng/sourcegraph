import assert from 'assert'
import { TestScheduler } from 'rxjs/testing'
import { Environment } from '../environment'
import { Extension } from '../extension'
import { activeExtensions } from './extensions'

const scheduler = () => new TestScheduler((a, b) => assert.deepStrictEqual(a, b))

function noopExtensionActivationFilter(environment: Pick<Environment, 'extensions'>): Extension[] {
    return environment.extensions || []
}

describe('activeExtensions', () => {
    it('emits an empty set', () =>
        scheduler().run(({ cold, expectObservable }) =>
            expectObservable(
                activeExtensions(
                    cold<Pick<Environment, 'configuration' | 'extensions' | 'visibleTextDocuments'>>('-a-|', {
                        a: { configuration: { final: {} }, extensions: [], visibleTextDocuments: [] },
                    }),
                    noopExtensionActivationFilter
                )
            ).toBe('-a-|', {
                a: [],
            })
        ))

    it('previously activated extensions remain activated when their activationEvents no longer match', () =>
        scheduler().run(({ cold, expectObservable }) =>
            expectObservable(
                activeExtensions(
                    cold<Pick<Environment, 'configuration' | 'extensions' | 'visibleTextDocuments'>>('-a-b-|', {
                        a: {
                            configuration: { final: { extensions: { x: true } } },
                            extensions: [{ id: 'x', manifest: null }],
                            visibleTextDocuments: [],
                        },
                        b: {
                            configuration: { final: { extensions: {} } },
                            extensions: [{ id: 'x', manifest: null }],
                            visibleTextDocuments: [],
                        },
                    }),
                    environment =>
                        (environment.extensions || []).filter(
                            x => environment.configuration.final.extensions[x.id] === true
                        )
                )
            ).toBe('-a-b-|', {
                a: [{ id: 'x', manifest: null }],
                b: [{ id: 'x', manifest: null }],
            })
        ))
})
