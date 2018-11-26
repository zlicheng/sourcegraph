import { Environment } from '../../../../shared/src/api/client/environment'
import { TextDocumentItem } from '../../../../shared/src/api/client/types/textDocument'
import { WorkspaceRoot } from '../../../../shared/src/api/protocol/plainTypes'

// TODO!(sqs)
export interface ExtensionsEnvironmentProps {
    environment: Environment
}

/** React props for components that participate in the Sourcegraph extensions environment. */
export interface ExtensionsDocumentsProps {
    /**
     * Called when the Sourcegraph extensions environment's workspace roots change.
     */
    extensionsOnRootsChange: (roots: WorkspaceRoot[] | null) => void

    /**
     * Called when the Sourcegraph extensions environment's set of visible text documents changes.
     */
    extensionsOnVisibleTextDocumentsChange: (visibleTextDocuments: TextDocumentItem[] | null) => void
}
