import { Subscribable } from 'rxjs'
import { Environment } from './environment'
import { CommandRegistry } from './services/command'
import { ContributionRegistry } from './services/contribution'
import { TextDocumentDecorationProviderRegistry } from './services/decoration'
import { ExtensionRegistry } from './services/extensions'
import { TextDocumentHoverProviderRegistry } from './services/hover'
import { TextDocumentLocationProviderRegistry, TextDocumentReferencesProviderRegistry } from './services/location'
import { NotificationsService } from './services/notifications'
import { QueryTransformerRegistry } from './services/queryTransformer'
import { SettingsService } from './services/settings'
import { ViewProviderRegistry } from './services/view'

/**
 * Services is a container for all services used by the client application.
 */
export class Services {
    constructor(private environment: Subscribable<Environment>) {}

    public readonly commands = new CommandRegistry()
    public readonly contribution = new ContributionRegistry(this.environment)
    public readonly extensions = new ExtensionRegistry(this.environment)
    public readonly notifications = new NotificationsService()
    public readonly settings = new SettingsService()
    public readonly textDocumentDefinition = new TextDocumentLocationProviderRegistry()
    public readonly textDocumentImplementation = new TextDocumentLocationProviderRegistry()
    public readonly textDocumentReferences = new TextDocumentReferencesProviderRegistry()
    public readonly textDocumentTypeDefinition = new TextDocumentLocationProviderRegistry()
    public readonly textDocumentHover = new TextDocumentHoverProviderRegistry()
    public readonly textDocumentDecoration = new TextDocumentDecorationProviderRegistry()
    public readonly queryTransformer = new QueryTransformerRegistry()
    public readonly views = new ViewProviderRegistry()
}
