import { Observable } from 'rxjs'
import { map, tap } from 'rxjs/operators'
import { isExtensionEnabled } from '../../../extensions/extension'
import { isErrorLike } from '../../../util/errors'
import { Environment } from '../environment'
import { Extension } from '../extension'

/**
 * Returns an observable that emits the set of extensions that should be active, based on the
 * current state and each available extension's activationEvents. If an extension should be active
 * and is not yet active, it should be activated.
 *
 * An extension is activated when one or more of its activationEvents is true. After an extension
 * has been activated, it remains active for the rest of the session (i.e., for as long as the
 * browser tab remains open).
 *
 * @internal This is an internal implementation detail and is different from the product feature
 * called the "extension registry" (where users can search for and enable extensions).
 *
 * @todo Consider whether extensions should be deactivated if none of their activationEvents are
 * true (or that plus a certain period of inactivity).
 *
 * @param environment An observable that emits when the environment changes.
 * @param extensionActivationFilter A function that returns the set of extensions that should be
 * activated based on the current environment only.
 */
export function activeExtensions(
    environment: Observable<Pick<Environment, 'configuration' | 'extensions' | 'visibleTextDocuments'>>,
    extensionActivationFilter = extensionsWithMatchedActivationEvent
): Observable<Extension[]> {
    const activeExtensionIDs: string[] = []
    return environment.pipe(
        map(extensionActivationFilter),
        tap(extensions => {
            if (extensions) {
                for (const x of extensions) {
                    if (!activeExtensionIDs.includes(x.id)) {
                        activeExtensionIDs.push(x.id)
                    }
                }
            }
        }),
        map(extensions => extensions && extensions.filter(x => activeExtensionIDs.includes(x.id)))
    )
}

function extensionsWithMatchedActivationEvent(
    environment: Pick<Environment, 'configuration' | 'extensions' | 'visibleTextDocuments'>
): Extension[] {
    if (!environment.extensions) {
        return []
    }
    return environment.extensions.filter(x => {
        try {
            if (!isExtensionEnabled(environment.configuration.final, x.id)) {
                return false
            } else if (!x.manifest) {
                console.warn(`Extension ${x.id} was not found. Remove it from settings to suppress this warning.`)
                return false
            } else if (isErrorLike(x.manifest)) {
                console.warn(x.manifest)
                return false
            } else if (!x.manifest.activationEvents) {
                console.warn(`Extension ${x.id} has no activation events, so it will never be activated.`)
                return false
            }
            const visibleTextDocumentLanguages = environment.visibleTextDocuments
                ? environment.visibleTextDocuments.map(({ languageId }) => languageId)
                : []
            return x.manifest.activationEvents.some(
                e => e === '*' || visibleTextDocumentLanguages.some(l => e === `onLanguage:${l}`)
            )
        } catch (err) {
            console.error(err)
        }
        return false
    })
}
