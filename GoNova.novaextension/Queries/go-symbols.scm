((function_declaration name: (identifier) @name) @subtree
 (#match? @name "^[A-Z]")
 (#set! role function))

((method_declaration name: (field_identifier) @name) @subtree
 (#match? @name "^[A-Z]")
 (#set! role method))

((const_declaration
	(const_spec name: (identifier) @name) @subtree)
 (#match? @name "^[A-Z]")
 (#set! role constant))

((var_declaration
	(var_spec name: (identifier) @name) @subtree)
 (#match? @name "^[A-Z]")
 (#set! role variable))

((type_declaration
	(type_spec name: (type_identifier) @name) @subtree)
 (#match? @name "^[A-Z]")
 (#set! role type))
