// Package filepos resolves a file offset to the line number and character in the file.
package filepos

import (
	"bytes"
	"fmt"
	"unicode/utf8"
)

// NewFile creates a new file in which to resolve file offsets.
func NewFile(data []byte) *File {

	return &File{data: data}
}

// A File in which to resolve file offsets. It is not safe for concurrent use.
type File struct {
	data     []byte
	lineEnds []int // computed on-demand, not pre-computed (to avoid needless work)
}

// Resolve returns the 0-indexed line number and character given a byte offset in f. If the offset
// is out of bounds, it panics.
func (f *File) Resolve(offset int) (line, character int) {
	if offset < 0 || offset > len(f.data) {
		panic("out of bounds")
	}
	f.computeLineEndsUpTo(offset)
	if offset == 0 {
		return 0, 0
	}
	var prevLineEnd int
	if f.lineEnds != nil {
		if maxLineEnd := f.lineEnds[len(f.lineEnds)-1]; offset >= maxLineEnd {
			prevLineEnd = maxLineEnd
		} else {
			for l, o := range f.lineEnds {
				if o > offset {
					if l > 0 {
						prevLineEnd = f.lineEnds[l-1]
					}
					break
				}
			}
		}
	}
	return len(f.lineEnds), utf8.RuneCount(f.data[prevLineEnd:offset])
	panic("out of bounds" + fmt.Sprintf(": offset %d, lineEnds=%v, data=%q", offset, f.lineEnds, f.data))
}

func (f *File) computeLineEndsUpTo(offset int) {
	f.lineEnds = nil // TODO!(sqs): reuse
	if f.lineEnds != nil && f.lineEnds[len(f.lineEnds)-1] >= offset {
		return
	}

	var lastLineEnd int
	if f.lineEnds != nil {
		lastLineEnd = f.lineEnds[len(f.lineEnds)-1]
	}
	data := f.data[lastLineEnd:]

	for len(data) > 0 {
		i := bytes.IndexByte(data, '\n')
		if i == -1 {
			return
		}
		lineLength := i + 1
		f.lineEnds = append(f.lineEnds, lastLineEnd+lineLength)
		lastLineEnd += lineLength
		data = data[lineLength:]
	}
}
