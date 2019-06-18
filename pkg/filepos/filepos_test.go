package filepos

import (
	"fmt"
	"strconv"
	"testing"
)

func TestFile_Resolve(t *testing.T) {
	tests := []struct {
		data    string
		resolve [][3]int // offset -> (line, character)
	}{
		{
			data:    "",
			resolve: [][3]int{{0, 0, 0}},
		},
		{
			data:    "\n",
			resolve: [][3]int{{0, 0, 0}, {1, 1, 0}},
		},
		{
			data:    "a",
			resolve: [][3]int{{0, 0, 0}, {1, 0, 1}},
		},
		{
			data:    "a\n",
			resolve: [][3]int{{0, 0, 0}, {1, 0, 1}, {2, 1, 0}},
		},
		{
			data:    "\na",
			resolve: [][3]int{{0, 0, 0}, {1, 1, 0}, {2, 1, 1}},
		},
		{
			data:    "a\nb",
			resolve: [][3]int{{0, 0, 0}, {1, 0, 1}, {2, 1, 0}, {3, 1, 1}},
		},
		// TODO!(sqs): add unicode chars, add \r\n
	}
	for i, test := range tests {
		t.Run(strconv.Itoa(i), func(t *testing.T) {
			file := NewFile([]byte(test.data))
			for _, resolve := range test.resolve {
				offset := resolve[0]
				wantLine := resolve[1]
				wantCharacter := resolve[2]
				t.Run(fmt.Sprintf("offset %d", offset), func(t *testing.T) {
					line, character := file.Resolve(offset)
					if line != wantLine {
						t.Errorf("got line %d, want %d", line, wantLine)
					}
					if character != wantCharacter {
						t.Errorf("got character %d, want %d", character, wantCharacter)
					}
					if t.Failed() {
						t.Logf("data: %q", file.data)
						t.Logf("lineEnds: %v", file.lineEnds)
					}
				})
			}
		})
	}

	t.Run("negative offset", func(t *testing.T) {
		defer func() { recover() }()
		file := NewFile([]byte("abc"))
		file.Resolve(-1)
		t.Error("want panic")
	})

	t.Run("out-of-bounds positive offset", func(t *testing.T) {
		defer func() { recover() }()
		file := NewFile([]byte("abc"))
		file.Resolve(100)
		t.Error("want panic")
	})
}
