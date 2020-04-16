package query

import (
	"testing"

	"github.com/inconshreveable/log15"
)

type callback func(field, value string, negated bool) bool

type CoolFinderVisitor struct {
	stop     bool
	callback callback
	BaseVisitor
}

func (s *CoolFinderVisitor) VisitNodes(visitor Visitor, nodes []Node) {
	for _, node := range nodes {
		if s.stop {
			return
		}
		switch v := node.(type) {
		case Parameter:
			visitor.VisitParameter(visitor, v.Field, v.Value, v.Negated)
		case Operator:
			visitor.VisitOperator(visitor, v.Kind, v.Operands)
		default:
			panic("unreachable")
		}
	}
}

func (s *CoolFinderVisitor) VisitParameter(visitor Visitor, field, value string, negated bool) {
	if s.callback(field, value, negated) {
		s.stop = true
	}
}

func CoolVisitParameter(nodes []Node, callback callback) {
	visitor := &CoolFinderVisitor{callback: callback}
	visitor.VisitNodes(visitor, nodes)
}

func Test_VisitFinder(t *testing.T) {
	q, _ := parseAndOr("repo:foo a or b and c repo:Bar")
	CoolVisitParameter(q, func(field, value string, _ bool) bool {
		log15.Info("seen", "val", value)
		if value == "a" {
			return true
		}
		return false
	})
}
