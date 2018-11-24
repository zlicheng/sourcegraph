import { Observable } from 'rxjs'
import { Environment } from './environment'
import { CommandRegistry } from './providers/command'
import { ContributionRegistry } from './providers/contribution'
import { TextDocumentDecorationProviderRegistry } from './providers/decoration'
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
    public readonly textDocumentDefinition = new TextDocumentLocationProviderRegistry()
    public readonly textDocumentImplementation = new TextDocumentLocationProviderRegistry()
    public readonly textDocumentReferences = new TextDocumentReferencesProviderRegistry()
    public readonly textDocumentTypeDefinition = new TextDocumentLocationProviderRegistry()
    public readonly textDocumentHover = new TextDocumentHoverProviderRegistry()
    public readonly textDocumentDecoration = new TextDocumentDecorationProviderRegistry()
    public readonly queryTransformer = new QueryTransformerRegistry()
    public readonly views = new ViewProviderRegistry()
}
