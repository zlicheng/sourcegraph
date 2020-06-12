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

func (p *parser) ParsePatternLiteral() Pattern {
	// Accept unconditionally as pattern, even if the pattern
	// contains dangling quotes like " or ', and do not interpret
	// quoted strings as quoted, but interpret them literally.
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
			if isSet(p.heuristics, allowDanglingParens) {
				// Consume strings containing unbalanced
				// parentheses up to whitespace.
				pattern := p.ParsePatternLiteral()
				nodes = append(nodes, pattern)
				break loop
			}
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
			parameter, ok, err := p.ParseParameter()
			if err != nil {
				return nil, err
			}
			if ok {
				nodes = append(nodes, parameter)
			} else {
				pattern := p.ParsePatternLiteral()
				nodes = append(nodes, pattern)
			}
		}
	}
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
		// The query is unbalanced and we need to try something more
		//  aggressive. For example, the query might be something like
		//  "(x" or "x or (x" which start with a leading open
		//  parenthesis.
		log15.Info("Unbalanced for " + prettyPrint(nodes))
		if nodes, err := literalFallbackParser(in); err == nil {
			return nodes, nil
		}
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
