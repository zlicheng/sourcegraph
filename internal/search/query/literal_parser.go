package query

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/inconshreveable/log15"
)

// ScanAnyPatternLiteral consumes all characters up to a whitespace character and returns
// the string and how much it consumed.
func ScanAnyPatternLiteral(buf []byte) (scanned string, count int) {
	var advance int
	var r rune
	var result []rune

	next := func() rune {
		r, advance = utf8.DecodeRune(buf)
		count += advance
		buf = buf[advance:]
		return r
	}
	for len(buf) > 0 {
		start := count
		r = next()
		if unicode.IsSpace(r) {
			count = start // Backtrack.
			break
		}
		result = append(result, r)
	}
	scanned = string(result)
	log15.Info("scanned", "v", scanned)
	return scanned, count
}

// Do I scan up to whitespace, or whitespace and balanced? I think whitespace and balanced.
// Yeah, because if you have (lisp lisp) we want the parens to be literal.

// ScanBalancedPatternLiteral is like ScanAnyPatternLiteral, except that it is
// more strict about scanning on two points. It will:
// (1) it will stop scanning the moment it detects an unbalanced parenthesis.
// (2) reject strings that contain potential 'and' or 'or' keywords, and
//
// I.e., not (<contains keyword> and <is balanced>) holds.

// consumes all characters up to a whitespace character and returns
// the string and how much it consumed.

// maybe only do this if we detect a paren in a string...
func ScanBalancedPatternLiteral(buf []byte) (scanned string, count int, ok bool) {
	var advance, balanced int
	var r rune
	var piece []rune
	var pieces []string

	next := func() rune {
		r, advance = utf8.DecodeRune(buf)
		count += advance
		buf = buf[advance:]
		return r
	}

loop:
	for len(buf) > 0 {
		start := count
		r = next()
		switch {
		case unicode.IsSpace(r) && balanced == 0:
			// Stop scanning a potential pattern when we see
			// whitespace in a balanced state.
			break loop
		case r == '(':
			balanced++
			piece = append(piece, r)
		case r == ')':
			balanced--
			if balanced < 0 {
				// This paren is an unmatched closing paren, so
				// we stop treating it as a potential pattern
				// here--it might be closing a group.
				count = start // Backtrack.
				balanced = 0
				break loop
			}
			piece = append(piece, r)
		case unicode.IsSpace(r):
			// We see a space and the pattern is unbalanced, so assume this
			// terminates a piece of an incomplete search pattern.
			if len(piece) > 0 {
				pieces = append(pieces, string(piece))
			}
			piece = piece[:0]
		default:
			piece = append(piece, r)
		}
	}
	if len(piece) > 0 {
		pieces = append(pieces, string(piece))
	}
	scanned = strings.Join(pieces, " ") // Shortcut.
	log15.Info("scanned balanced", "v", scanned)
	if ContainsAndOrKeyword(scanned) {
		// Reject the whole thing if we scanned 'and' or 'or'. Preceding
		// parentheses likely refer to a group, not a pattern.
		log15.Info("rejected", "", "")
		return "", 0, false
	}
	return scanned, count, balanced == 0
}

func (p *parser) ParsePatternLiteral() Pattern {
	if value, advance, ok := ScanBalancedPatternLiteral(p.buf[p.pos:]); ok {
		p.pos += advance
		return Pattern{Value: value, Negated: false, Annotation: Annotation{Labels: Literal}}
	}
	value, advance := ScanAnyPatternLiteral(p.buf[p.pos:])
	p.pos += advance
	return Pattern{Value: value, Negated: false, Annotation: Annotation{Labels: Literal}}
}

// parseParameterParameterList scans for consecutive leaf nodes.
func (p *parser) parseParameterListLiteral() ([]Node, error) {
	var nodes []Node
loop:
	for {
		if err := p.skipSpaces(); err != nil {
			return nil, err
		}
		if p.done() {
			break loop
		}
		switch {
		case p.match(LPAREN):
			if value, advance, ok := ScanBalancedPatternLiteral(p.buf[p.pos:]); ok {
				p.pos += advance
				pattern := Pattern{Value: value, Negated: false, Annotation: Annotation{Labels: Literal}}
				nodes = append(nodes, pattern)
				continue
			}
			if isSet(p.heuristics, allowDanglingParens) {
				// Consume strings containing unbalanced
				// parentheses up to whitespace.
				pattern := p.ParsePatternLiteral()
				nodes = append(nodes, pattern)
				continue
			}
			log15.Info("2.")
			_ = p.expect(LPAREN) // Guaranteed to succeed.
			p.balanced++
			log15.Info("scanned", "v", "(")
			p.heuristics |= disambiguated
			result, err := p.parseOrLiteral()
			if err != nil {
				return nil, err
			}
			nodes = append(nodes, result...)
		case p.expect(RPAREN):
			p.balanced--
			p.heuristics |= disambiguated
			if len(nodes) == 0 {
				// We parsed "()".
				// Interpret literally.
				nodes = []Node{Pattern{Value: "()", Annotation: Annotation{Labels: Literal | HeuristicParensAsPatterns}}}
			}
			break loop
		case p.matchKeyword(AND), p.matchKeyword(OR):
			// Caller advances.
			break loop
		default:
			log15.Info("3.")
			parameter, ok, err := p.ParseParameter()
			if err != nil {
				return nil, err
			}
			if ok {
				nodes = append(nodes, parameter)
			} else {
				log15.Info("ParsePatternLiteral", "", "")
				pattern := p.ParsePatternLiteral()
				log15.Info("pattern", "", prettyPrint([]Node{pattern}))
				nodes = append(nodes, pattern)
			}
		}
	}
	log15.Info("result", "", prettyPrint(nodes))
	return partitionParameters(nodes), nil
}

// parseAnd parses and-expressions.
func (p *parser) parseAndLiteral() ([]Node, error) {
	left, err := p.parseParameterListLiteral()
	log15.Info("balanced", "", fmt.Sprintf("%d", p.balanced))
	if err != nil {
		return nil, err
	}
	if left == nil {
		return nil, &ExpectedOperand{Msg: fmt.Sprintf("expected operand at %d", p.pos)}
	}
	if !p.expect(AND) {
		return left, nil
	}
	right, err := p.parseAndLiteral()
	if err != nil {
		return nil, err
	}
	return newOperator(append(left, right...), And), nil
}

// parseOr parses or-expressions. Or operators have lower precedence than And
// operators, therefore this function calls parseAnd.
func (p *parser) parseOrLiteral() ([]Node, error) {
	left, err := p.parseAndLiteral()
	if err != nil {
		return nil, err
	}
	if left == nil {
		return nil, &ExpectedOperand{Msg: fmt.Sprintf("expected operand at %d", p.pos)}
	}
	if !p.expect(OR) {
		return left, nil
	}
	right, err := p.parseOrLiteral()
	if err != nil {
		return nil, err
	}
	return newOperator(append(left, right...), Or), nil
}

func prettyPrint(nodes []Node) string {
	var resultStr []string
	for _, node := range nodes {
		resultStr = append(resultStr, node.String())
	}
	return strings.Join(resultStr, " ")
}

func literalFallbackParser(in string) ([]Node, error) {
	parser := &parser{
		buf:        []byte(in),
		heuristics: allowDanglingParens,
	}
	nodes, err := parser.parseOrLiteral()
	if err != nil {
		return nil, err
	}
	if hoistedNodes, err := Hoist(nodes); err == nil {
		return newOperator(hoistedNodes, And), nil
	}
	return newOperator(nodes, And), nil
}

func ParseAndOrLiteral(in string) ([]Node, error) {
	if strings.TrimSpace(in) == "" {
		return nil, nil
	}
	parser := &parser{buf: []byte(in)}
	nodes, err := parser.parseOrLiteral()
	if err != nil {
		switch err.(type) {
		case *ExpectedOperand:
			// The query is something like "(" or "x or" and expects
			// an operand. Try parse something like this.
			if nodes, err := literalFallbackParser(in); err == nil {
				return nodes, nil
			}
		}
		// Another kind of error, like a malformed parameter.
		return nil, err
	}
	if parser.balanced != 0 {
		// The query is (still) unbalanced and we need to try something more
		//  aggressive. For example, the query might be something like
		//  "(x" or "x or (x" which start with a leading open
		//  parenthesis.
		log15.Info("Unbalanced for " + prettyPrint(nodes))
		if nodes, err := literalFallbackParser(in); err == nil {
			return nodes, nil
		}
		panic("fail") // Unsupported?
	}
	if !isSet(parser.heuristics, disambiguated) {
		// Hoist or expressions if this query is potential ambiguous.
		if hoistedNodes, err := Hoist(nodes); err == nil {
			nodes = hoistedNodes
		}
	}
	nodes = Map(nodes, LowercaseFieldNames, SubstituteAliases)
	err = validate(nodes)
	if err != nil {
		return nil, err
	}
	return newOperator(nodes, And), nil
}
