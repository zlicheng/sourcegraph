package query

// The Visitor interface allows to visit nodes for each respective part of the
// query grammar.
type Visitor interface {
	VisitNodes(v Visitor, node []Node)
	VisitOperator(v Visitor, kind operatorKind, operands []Node)
	VisitParameter(v Visitor, field, value string, negated bool)
}

// The BaseVisitor is a visitor that recursively visits each node in a query.
// A BaseVisitor's methods may be overriden by embedding it a
// custom visitor's definition. See OperatorVisitor for an example.
type BaseVisitor struct{}

func (*BaseVisitor) VisitNodes(visitor Visitor, nodes []Node) {
	for _, node := range nodes {
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

func (*BaseVisitor) VisitOperator(visitor Visitor, kind operatorKind, operands []Node) {
	visitor.VisitNodes(visitor, operands)
}

func (*BaseVisitor) VisitParameter(visitor Visitor, field, value string, negated bool) {}

// OperatorVisitor is a helper visitor that only visits operators in a query. It
// takes as state a callback that will call each visited operator.
type OperatorVisitor struct {
	callback func(kind operatorKind, operands []Node)
	BaseVisitor
}

func (s *OperatorVisitor) VisitOperator(visitor Visitor, kind operatorKind, operands []Node) {
	s.callback(kind, operands)
	visitor.VisitNodes(visitor, operands)
}

// VisitOperator is a convenience function that calls callback on all operator
// nodes. callback supplies the node's kind and operands.
func VisitOperator(nodes []Node, callback func(kind operatorKind, operands []Node)) {
	visitor := &OperatorVisitor{callback: callback}
	visitor.VisitNodes(visitor, nodes)
}

// ParameterVisitor is a helper visitor that only visits parameters in a query,
// and supplies these via a callback.
type ParameterVisitor struct {
	callback func(field, value string, negated bool)
	BaseVisitor
}

func (s *ParameterVisitor) VisitParameter(visitor Visitor, field, value string, negated bool) {
	s.callback(field, value, negated)
}

// VisitParameter is a convenience function that calls callback on all parameter
// nodes. callback supplies the node's field, value, and whether the value is
// negated.
func VisitParameter(nodes []Node, callback func(field, value string, negated bool)) {
	visitor := &ParameterVisitor{callback: callback}
	visitor.VisitNodes(visitor, nodes)
}

// FieldVisitor is a helper visitor that only visits parameter fields in a
// query, for a specified field specified in the state. For each parameter with
// this field name it calls the callback.
type FieldVisitor struct {
	field    string
	callback func(value string, negated bool)
	BaseVisitor
}

func (s *FieldVisitor) VisitParameter(visitor Visitor, field, value string, negated bool) {
	if s.field == field {
		s.callback(value, negated)
	}
}

// VisitField convenience function that calls callback on all parameter nodes
// whose field matches the field argument. callback supplies the node's value
// and whether the value is negated.
func VisitField(nodes []Node, field string, callback func(value string, negated bool)) {
	visitor := &FieldVisitor{callback: callback, field: field}
	visitor.VisitNodes(visitor, nodes)
}
