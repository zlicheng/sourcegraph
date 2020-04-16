package query

import (
	"testing"

	"github.com/inconshreveable/log15"
)

type CoolFinderVisitor struct {
	stop     func() bool
	callback func(field, value string, negated bool)
	BaseVisitor
}

func (s *CoolFinderVisitor) VisitNodes(visitor Visitor, nodes []Node) {
	for _, node := range nodes {
		if s.stop() {
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
	s.callback(field, value, negated)
}

func CoolVisitParameter(nodes []Node, stop func() bool, callback func(field, value string, negated bool)) {
	visitor := &CoolFinderVisitor{callback: callback, stop: stop}
	visitor.VisitNodes(visitor, nodes)
}

func Test_VisitFinder(t *testing.T) {
	q, _ := parseAndOr("repo:foo a or b and c repo:Bar")
	wrong := func() bool { return true }
	CoolVisitParameter(q, wrong, func(field, value string, _ bool) {
		log15.Info("seen", "val", value)
		if value == "a" {
			// stop()
		}
	})
}
