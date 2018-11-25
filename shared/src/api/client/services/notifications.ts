import { Subject } from 'rxjs'

import { LogMessageParams, ShowMessageParams } from '../../protocol'

import { ShowInputRequest, ShowMessageRequest } from '../client'

export class NotificationsService {
    /** Log messages from extensions. */
    public readonly logMessages = new Subject<LogMessageParams>()

    /** Messages from extensions intended for display to the user. */
    public readonly showMessages = new Subject<ShowMessageParams>()

    /** Messages from extensions requesting the user to select an action. */
    public readonly showMessageRequests = new Subject<ShowMessageRequest>()

    /** Messages from extensions requesting text input from the user. */
    public readonly showInputs = new Subject<ShowInputRequest>()
}
