((function_declaration name: (identifier) @name) @subtree
 (#set! role function))

((method_declaration name: (field_identifier) @name) @subtree
 (#set! role method))

((const_declaration
	(const_spec name: (identifier) @name) @subtree)
 (#set! role constant))

((var_declaration
	(var_spec name: (identifier) @name) @subtree)
 (#set! role variable))

((type_declaration
	(type_spec name: (type_identifier) @name) @subtree)
 (#set! role type))
