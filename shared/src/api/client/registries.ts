import { Observable, Subject } from 'rxjs'
import { LogMessageParams, ShowMessageParams } from '../protocol'
import { ConfigurationUpdate, ShowInputRequest, ShowMessageRequest } from './client'
import { Environment } from './environment'
import { CommandRegistry } from './providers/command'
import { ContributionRegistry } from './providers/contribution'
import { TextDocumentDecorationProviderRegistry } from './providers/decoration'
import { ExtensionRegistry } from './providers/extensions'
import { TextDocumentHoverProviderRegistry } from './providers/hover'
import { TextDocumentLocationProviderRegistry, TextDocumentReferencesProviderRegistry } from './providers/location'
import { QueryTransformerRegistry } from './providers/queryTransformer'
import { ViewProviderRegistry } from './providers/view'

/**
 * Registries is a container for all provider registries.
 */
export class Registries {
    constructor(private environment: Observable<Environment>) {}

    public readonly commands = new CommandRegistry()
    public readonly contribution = new ContributionRegistry(this.environment)
    public readonly extensions = new ExtensionRegistry(this.environment)
    public readonly textDocumentDefinition = new TextDocumentLocationProviderRegistry()
    public readonly textDocumentImplementation = new TextDocumentLocationProviderRegistry()
    public readonly textDocumentReferences = new TextDocumentReferencesProviderRegistry()
    public readonly textDocumentTypeDefinition = new TextDocumentLocationProviderRegistry()
    public readonly textDocumentHover = new TextDocumentHoverProviderRegistry()
    public readonly textDocumentDecoration = new TextDocumentDecorationProviderRegistry()
    public readonly queryTransformer = new QueryTransformerRegistry()
    public readonly views = new ViewProviderRegistry()

    // TODO!(sqs): clean these "registries" up

    /** Log messages from extensions. */
    public readonly logMessages = new Subject<LogMessageParams>()

    /** Messages from extensions intended for display to the user. */
    public readonly showMessages = new Subject<ShowMessageParams>()

    /** Messages from extensions requesting the user to select an action. */
    public readonly showMessageRequests = new Subject<ShowMessageRequest>()

    /** Messages from extensions requesting text input from the user. */
    public readonly showInputs = new Subject<ShowInputRequest>()

    /** Configuration updates from extensions. */
    public readonly configurationUpdates = new Subject<ConfigurationUpdate>()
}
