import { Subject } from 'rxjs'
import { PromiseCallback } from '../../util'

/**
 * A key path that refers to a location in a JSON document.
 *
 * Each successive array element specifies an index in an object or array to descend into. For example, in the
 * object `{"a": ["x", "y"]}`, the key path `["a", 1]` refers to the value `"y"`.
 */
export type KeyPath = (string | number)[]

export interface SettingsUpdate {
    /** The key path to the value. */
    path: KeyPath

    /** The new value to insert at the key path. */
    value: any
}

export class SettingsService {
    public readonly updates = new Subject<SettingsUpdate & PromiseCallback<void>>()
}
