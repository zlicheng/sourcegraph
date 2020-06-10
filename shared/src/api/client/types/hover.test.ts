import { MarkupKind } from '@sourcegraph/extension-api-classes'
import { Range } from '@sourcegraph/extension-api-types'
import { fromHoverMerged } from './hover'

const FIXTURE_RANGE: Range = { start: { line: 1, character: 2 }, end: { line: 3, character: 4 } }

describe('HoverMerged', () => {
    describe('from', () => {
        test('0 hovers', () => expect(fromHoverMerged([])).toEqual({contents: [], tooltips: []}))
        test('empty hovers', () => expect(fromHoverMerged([null, undefined])).toEqual({contents: [], tooltips: []}))
        test('empty string hovers', () => expect(fromHoverMerged([{ contents: { value: '' }, tooltips: [] }])).toEqual({contents: [], tooltips: []}))
        test('1 MarkupContent', () =>
            expect(fromHoverMerged([{ contents: { kind: MarkupKind.Markdown, value: 'x' }, tooltips: []  }])).toEqual({
                contents: [{ kind: MarkupKind.Markdown, value: 'x' }],
                tooltips: []
            }))
        test('2 MarkupContents', () =>
            expect(
                fromHoverMerged([
                    { contents: { kind: MarkupKind.Markdown, value: 'x' }, tooltips: [], range: FIXTURE_RANGE },
                    { contents: { kind: MarkupKind.Markdown, value: 'y' }, tooltips: [] },
                ])
            ).toEqual({
                contents: [
                    { kind: MarkupKind.Markdown, value: 'x' },
                    { kind: MarkupKind.Markdown, value: 'y' },
                ],
                tooltips: [],
                range: FIXTURE_RANGE,
            }))
    })
})
