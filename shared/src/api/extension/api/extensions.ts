/** @internal */
export interface ExtExtensionsAPI {
    $activateExtension(bundleURL: string): Promise<void>
}

/** @internal */
export class ExtExtensions implements ExtExtensionsAPI {
    /**
     * Proxy method invoked by the client to load an extension and invoke its `activate` function to start running it.
     *
     * It also sets up global hooks so that when the extension's code uses `require('sourcegraph')` and
     * `import 'sourcegraph'`, it gets the extension API handle (the value specified in
     * sourcegraph.d.ts).
     *
     * @param bundleURL The URL to the JavaScript source file (that exports an `activate` function) for
     * the extension.
     * @returns The extension's deactivate function (or a noop if it has none), and an activation
     * promise that resolves when activation finishes.
     * @throws An error if importScripts fails on the extension bundle.
     */
    public $activateExtension(
        bundleURL: string
    ): /*{
    activation: Promise<void>
    deactivate: () => Promise<void>
}*/ Promise<void> {
        console.log(
            'TODO!(sqs): check origin, see https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#Security_concerns'
        )
        console.log('TODO!(sqs)')
        console.log('TODO!(sqs)')
        console.log('TODO!(sqs)')
        console.log('TODO!(sqs)')
        console.log('TODO!(sqs)')
        console.log('TODO!(sqs)')
        console.log('TODO!(sqs)')

        // Load the extension bundle and retrieve the extension entrypoint module's exports on
        // the global `module` property.
        try {
            ;(self as any).exports = {}
            ;(self as any).module = {}
            ;(self as any).importScripts(bundleURL)
        } catch (error) {
            throw Object.assign(new Error('error executing extension bundle (in importScripts)'), { error })
        }
        const extensionExports = (self as any).module.exports
        delete (self as any).exports
        delete (self as any).module

        // Wrap in Promise constructor so that the behavior is consistent for both sync and async
        // activate functions that throw errors. Both cases should yield a rejected promise.
        const activation = new Promise<void>((resolve, reject) => {
            if ('activate' in extensionExports) {
                // This will yield a rejected promise if activation throws or rejects.
                resolve(extensionExports.activate())
            } else {
                reject(new Error(`error activating extension: extension did not export an 'activate' function`))
            }
        })
        return activation

        // return {
        //     activation,
        //     deactivate: async () => {
        //         if ('deactivate' in extensionExports) {
        //             try {
        //                 await Promise.resolve(extensionExports.deactivate())
        //             } catch (err) {
        //                 console.warn(`Extension 'deactivate' function threw an error.`, err)
        //             }
        //         }
        //     },
        // }
    }
}
