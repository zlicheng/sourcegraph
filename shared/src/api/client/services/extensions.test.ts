import assert from 'assert'
import { TestScheduler } from 'rxjs/testing'
import { ConfiguredExtension } from '../../../extensions/extension'
import { isErrorLike } from '../../../util/errors'
import { Environment } from '../environment'
import { ExecutableExtension, ExtensionRegistry } from './extensions'

const scheduler = () => new TestScheduler((a, b) => assert.deepStrictEqual(a, b))

function noopExtensionActivationFilter(environment: Pick<Environment, 'extensions'>): ConfiguredExtension[] {
    return environment.extensions || []
}

describe('activeExtensions', () => {
    it('emits an empty set', () =>
        scheduler().run(({ cold, expectObservable }) =>
            expectObservable(
                new ExtensionRegistry(
                    cold<Pick<Environment, 'configuration' | 'extensions' | 'visibleTextDocuments'>>('-a-|', {
                        a: { configuration: { final: {}, subjects: [] }, extensions: [], visibleTextDocuments: [] },
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
                            configuration: { final: { extensions: { x: true } }, subjects: [] },
                            extensions: [{ id: 'x', manifest: { url: 'u', activationEvents: [] }, rawManifest: null }],
                            visibleTextDocuments: [],
                        },
                        b: {
                            configuration: { final: {}, subjects: [] },
                            extensions: [{ id: 'x', manifest: { url: 'u', activationEvents: [] }, rawManifest: null }],
                            visibleTextDocuments: [],
                        },
                    }),
                    environment =>
                        (environment.extensions || []).filter(
                            x =>
                                environment.configuration.final &&
                                !isErrorLike(environment.configuration.final) &&
                                environment.configuration.final.extensions &&
                                environment.configuration.final.extensions[x.id]
                        )
                ).activeExtensions
            ).toBe('-a-b-|', {
                a: [{ id: 'x', scriptURL: 'u' }],
                b: [{ id: 'x', scriptURL: 'u' }],
            } as Record<string, ExecutableExtension[]>)
        ))
})
