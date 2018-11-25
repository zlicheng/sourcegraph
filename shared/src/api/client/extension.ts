/** An extension. */
export interface Extension {
    /** The extension ID. */
    readonly id: string

    // TODO!(sqs): remove this, dedupe it with ConfiguredExtension
    manifest: {
        url?: string
        activationEvents?: string[]
    } | null
}
