import { Observable, Subscription } from 'rxjs'
import { SettingsCascade } from '../../../settings/settings'
import { createProxyAndHandleRequests } from '../../common/proxy'
import { ExtConfigurationAPI } from '../../extension/api/configuration'
import { Connection, ConnectionError, ConnectionErrors } from '../../protocol/jsonrpc2/connection'
import { SettingsUpdate } from '../services/settings'

/** @internal */
// TODO!3(sqs): rename to settings
export interface ClientConfigurationAPI {
    $acceptConfigurationUpdate(params: SettingsUpdate): Promise<void>
}

/**
 * @internal
 * @template C - The configuration schema.
 */
export class ClientConfiguration<C> implements ClientConfigurationAPI {
    private subscriptions = new Subscription()
    private proxy: ExtConfigurationAPI<C>

    constructor(
        connection: Connection,
        environmentConfiguration: Observable<SettingsCascade<C>>,
        private updateConfiguration: (params: SettingsUpdate) => Promise<void>
    ) {
        this.proxy = createProxyAndHandleRequests('configuration', connection, this)

        this.subscriptions.add(
            environmentConfiguration.subscribe(config => {
                this.proxy.$acceptConfigurationData(config).catch(error => {
                    if (error instanceof ConnectionError && error.code === ConnectionErrors.Unsubscribed) {
                        // This error was probably caused by the user disabling
                        // an extension, which is a normal occurrence.
                        return
                    }
                    throw error
                })
            })
        )
    }

    public async $acceptConfigurationUpdate(params: SettingsUpdate): Promise<void> {
        await this.updateConfiguration(params)
    }

    public unsubscribe(): void {
        this.subscriptions.unsubscribe()
    }
}
