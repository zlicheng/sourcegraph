import * as assert from 'assert'
import { Observable } from 'rxjs'
import { first } from 'rxjs/operators'
import { ActivatedExtension, ExtensionHostClient, ExtensionConnectionKey } from './client'
import { EMPTY_ENVIRONMENT, Environment } from './environment'

class TestClient extends ExtensionHostClient<any, any> {
    public get clientEntries(): Observable<ActivatedExtension[]> & { value: ActivatedExtension[] } {
        let value!: ActivatedExtension[]
        super.clientEntries
            .pipe(first())
            .subscribe(clients => (value = clients))
            .unsubscribe()
        return { ...super.clientEntries, value } as Observable<ActivatedExtension[]> & { value: ActivatedExtension[] }
    }
}

const create = (environment?: Environment): TestClient => {
    const controller = new TestClient({
        clientOptions: () => ({
            createMessageTransports: async () => {
                throw new Error('connection is not used in unit test')
            },
        }),
    })
    if (environment) {
        controller.setEnvironment(environment)
    }
    return controller
}

const FIXTURE_ENVIRONMENT: Environment<any, any> = {
    roots: [],
    visibleTextDocuments: [{ uri: 'file:///f', languageId: 'l', text: '' }],
    extensions: [{ id: 'x' }],
    configuration: {},
    context: {},
}

describe('Controller', () => {
    it('creates clients for the environment', () => {
        const controller = create(FIXTURE_ENVIRONMENT)
        assert.deepStrictEqual(
            controller.clientEntries.value.map(({ key }) => ({ id: key.id })) as ExtensionConnectionKey[],
            [{ id: 'x' }] as ExtensionConnectionKey[]
        )
    })

    it('creates clients for extensions even when root and component are not set', () => {
        assert.strictEqual(
            create({ ...EMPTY_ENVIRONMENT, extensions: FIXTURE_ENVIRONMENT.extensions }).clientEntries.value.length,
            1
        )
    })

    it('creates no clients if the environment needs none', () => {
        assert.deepStrictEqual(create(EMPTY_ENVIRONMENT).clientEntries.value, [])
    })
})
