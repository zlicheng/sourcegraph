import assert from 'assert'
import { TestScheduler } from 'rxjs/testing'
import { Environment } from '../environment'
import { Extension } from '../extension'
import { ExecutableExtension, ExtensionRegistry } from './extensions'

const scheduler = () => new TestScheduler((a, b) => assert.deepStrictEqual(a, b))

function noopExtensionActivationFilter(environment: Pick<Environment, 'extensions'>): Extension[] {
    return environment.extensions || []
}

describe('activeExtensions', () => {
    it('emits an empty set', () =>
        scheduler().run(({ cold, expectObservable }) =>
            expectObservable(
                new ExtensionRegistry(
                    cold<Pick<Environment, 'configuration' | 'extensions' | 'visibleTextDocuments'>>('-a-|', {
                        a: { configuration: { final: {} }, extensions: [], visibleTextDocuments: [] },
                    }),
                    noopExtensionActivationFilter
                ).activeExtensions
            ).toBe('-a-|', {
                a: [],
            })
        ))

    it('previously activated extensions remain activated when their activationEvents no longer match', () =>
        scheduler().run(({ cold, expectObservable }) =>
            expectObservable(
                new ExtensionRegistry(
                    cold<Pick<Environment, 'configuration' | 'extensions' | 'visibleTextDocuments'>>('-a-b-|', {
                        a: {
                            configuration: { final: { extensions: { x: true } } },
                            extensions: [{ id: 'x', manifest: { url: 'u' } }],
                            visibleTextDocuments: [],
                        },
                        b: {
                            configuration: { final: { extensions: {} } },
                            extensions: [{ id: 'x', manifest: { url: 'u' } }],
                            visibleTextDocuments: [],
                        },
                    }),
                    environment =>
                        (environment.extensions || []).filter(
                            x => environment.configuration.final.extensions[x.id] === true
                        )
                ).activeExtensions
            ).toBe('-a-b-|', {
                a: [{ id: 'x', scriptURL: 'u' }],
                b: [{ id: 'x', scriptURL: 'u' }],
            } as Record<string, ExecutableExtension[]>)
        ))
})
