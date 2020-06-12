package query

import (
	"strings"
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestParseAndOrLiteral(t *testing.T) {
	cases := []struct {
		Input      string
		Want       string
		WantLabels string
	}{
		{
			Input: "()",
			Want:  `"()"`,
		},
		{
			Input: `"`,
			Want:  `"\""`,
		},
		{
			Input: `""`,
			Want:  `"\"\""`,
		},
		{
			Input: "(",
			Want:  `"("`,
		},
		{
			Input: "repo:foo foo( or bar(",
			Want:  `(and "repo:foo" (or "foo(" "bar("))`,
		},
		{
			Input: "x or",
			Want:  `(concat "x" "or")`,
		},
		{
			Input: "repo:foo (x",
			Want:  `(and "repo:foo" "(x")`,
		},
		{
			Input: "(x or bar() )",
			Want:  `(or "x" "bar()")`,
		},
		{
			Input: "(x",
			Want:  `"(x"`,
		},
		{
			Input: "x or (x",
			Want:  `(or "x" "(x")`,
		},
		{
			Input: "(y or (z",
			Want:  `(or "(y" "(z")`,
		},
		{
			Input: "repo:foo (lisp)",
			Want:  `(and "repo:foo" "(lisp)")`,
		},
		{
			Input: "repo:foo (lisp lisp())",
			Want:  `(and "repo:foo" "(lisp lisp())")`,
		},
		{
			Input: "repo:foo (lisp or lisp)",
			Want:  `(and "repo:foo" (or "lisp" "lisp"))`,
		},
		{
			Input: "repo:foo (lisp or lisp())",
			Want:  `(and "repo:foo" (or "lisp" "lisp()"))`,
		},
		{
			Input: "repo:foo (lisp or lisp())",
			Want:  `(and "repo:foo" (or "lisp" "lisp()"))`,
		},
		// FIXME malformed, I want to see it.
		{
			Input: "repo:foo (lisp or lisp()",
			Want:  `(and "repo:foo" (or "(lisp" "lisp()"))`,
		},
		{
			Input: "(y or bar())",
			Want:  `(or "y" "bar()")`,
		},
		{
			Input: "((x or bar(",
			Want:  `(or "((x" "bar(")`,
		},
		{
			Input: "",
			Want:  "",
		},
		{
			Input: " ",
			Want:  "",
		},
		{
			Input: "  ",
			Want:  "",
		},
		{
			Input: "a",
			Want:  `"a"`,
		},
		{
			Input: " a",
			Want:  `"a"`,
		},
		{
			Input: `a `,
			Want:  `"a"`,
		},
		{
			Input: ` a b`,
			Want:  `(concat "a" "b")`,
		},
		{
			Input: `a  b`,
			Want:  `(concat "a" "b")`,
		},
		{
			Input: `:`,
			Want:  `":"`,
		},
		{
			Input: `:=`,
			Want:  `":="`,
		},
		{
			Input: `:= range`,
			Want:  `(concat ":=" "range")`,
		},
		{
			Input: "`",
			Want:  "\"`\"",
		},
		{
			Input: `'`,
			Want:  `"'"`,
		},
		{
			Input: "file:a",
			Want:  `"file:a"`,
		},
		{
			Input: `"file:a"`,
			Want:  `"\"file:a\""`,
		},
		{
			Input: `"x foo:bar`,
			Want:  `(concat "\"x" "foo:bar")`,
		},
		// -repo:c" is considered valid. "repo:b is a literal pattern.
		{
			Input: `"repo:b -repo:c"`,
			Want:  `(and "-repo:c\"" "\"repo:b")`,
		},
		{
			Input: `".*"`,
			Want:  `"\".*\""`,
		},
		{
			Input: `-pattern: ok`,
			Want:  `(concat "-pattern:" "ok")`,
		},
		{
			Input: `a:b "patterntype:regexp"`,
			Want:  `(concat "a:b" "\"patterntype:regexp\"")`,
		},
		// Whitespace is removed. content: exists for preserving whitespace.
		{
			Input: `lang:go func  main`,
			Want:  `(and "lang:go" (concat "func" "main"))`,
		},
		{
			Input: `\n`,
			Want:  `"\\n"`,
		},
		{
			Input: `\t`,
			Want:  `"\\t"`,
		},
		{
			Input: `\\`,
			Want:  `"\\\\"`,
		},
		{
			Input: `foo\d "bar*"`,
			Want:  `(concat "foo\\d" "\"bar*\"")`,
		},
		{
			Input: `\d`,
			Want:  `"\\d"`,
		},
		{
			Input: `type:commit message:"a commit message" after:"10 days ago"`,
			Want:  `(and "type:commit" "message:a commit message" "after:10 days ago")`,
		},
		{
			Input: `type:commit message:"a commit message" after:"10 days ago" test test2`,
			Want:  `(and "type:commit" "message:a commit message" "after:10 days ago" (concat "test" "test2"))`,
		},
		{
			Input: `type:commit message:'a commit message' after:'10 days ago' test test2`,
			Want:  `(and "type:commit" "message:a commit message" "after:10 days ago" (concat "test" "test2"))`,
		},
		{
			Input: `type:commit message:"a com"mit message" after:"10 days ago"`,
			Want:  `(and "type:commit" "message:a com" "after:10 days ago" (concat "mit" "message\""))`,
		},
		// For better or worse, escaping parentheses is not supported until we decide to do so.
		{
			Input: `bar and (foo or x\) ()`,
			Want:  `(and "bar" (concat (or "foo" "x\\") "()"))`,
		},
		// This test input should error because the single quote in 'after' is unclosed.
		/*
			{
				Input: `type:commit message:'a commit message' after:'10 days ago" test test2`,
				Want:  "",
			},
		*/
		{
			Input: `"quoted"`,
			Want:  `"\"quoted\""`,
		},
		// For implementation simplicity, behavior preserves whitespace
		// inside parentheses.
		{
			Input: "repo:foo (lisp    lisp)",
			Want:  `(and "repo:foo" "(lisp    lisp)")`,
		},
	}
	for _, tt := range cases {
		t.Run("literal search parse", func(t *testing.T) {
			result, err := ParseAndOrLiteral(tt.Input)
			if err != nil {
				panic("bad " + err.Error())
			}
			var resultStr []string
			for _, node := range result {
				resultStr = append(resultStr, node.String())
			}
			got := strings.Join(resultStr, " ")
			if diff := cmp.Diff(tt.Want, got); diff != "" {
				t.Error(diff)
			}
		})
	}
}
