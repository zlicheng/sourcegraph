import { MarkupKind } from '@sourcegraph/extension-api-classes'
import { Hover as PlainHover, Range } from '@sourcegraph/extension-api-types'
import { Badged, Hover, MarkupContent, Tooltip } from 'sourcegraph'

/** A hover that is merged from multiple Hover results and normalized. */
export interface HoverMerged {
    contents: Badged<MarkupContent>[]
    tooltips: Tooltip[]

    range?: Range
}

/** Create a merged hover from the given individual hovers. */
export function fromHoverMerged(values: (Badged<Hover | PlainHover> | null | undefined)[]): HoverMerged {
    const contents: HoverMerged['contents'] = []
    const tooltips: HoverMerged['tooltips'] = []
    let range: Range | undefined
    for (const result of values) {
        if (result) {
            if (result.contents && result.contents.value) {
                contents.push({
                    value: result.contents.value,
                    kind: result.contents.kind || MarkupKind.PlainText,
                    badge: result.badge,
                })
            }
            if (result.tooltips) {
                tooltips.push(...result.tooltips)
            }
            if (result.range && !range) {
                range = result.range
            }
        }
    }
    return range ? { contents, tooltips, range } : { contents, tooltips }
}
