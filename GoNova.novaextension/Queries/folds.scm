(import_declaration
  "import"
  (import_spec_list
    "(" @start
    ")" @end
  )
)

((function_declaration
  "func"
  body: (block
    "{" @start
    "}" @end
  )
)
(#set! role function))

(function_declaration
  (identifier)
  (parameter_list
    "(" @start
    ("," (_))*
    ")" @end
  )
)

((method_declaration
  "func"
  body: (block
    "{" @start
    "}" @end
  )
)
(#set! role function))

(call_expression
  function: (_)
  (argument_list
    "(" @start
    ("," (_))*
    ","?
    ")" @end
  )
)

(composite_literal
  type: (_)
  body: (literal_value
    "{" @start
    ("," (_)?)*
    "}" @end
  )
)

(literal_value
 "{" @start
 ("," (_)?)*
 "}" @end
)

(if_statement
  ["if" "else"]
  (block
    "{" @start
    "}" @end
  )
)

(if_statement
  "else"
  (if_statement
    "if"
    (block
      "{" @start
      "}" @end
    )
  )
)

(expression_switch_statement
  "switch"
  "{" @start
  "}" @end
)

((expression_switch_statement
  (expression_case
    "case"
    ":" @start
  )
  .
  [
    (expression_case "case" @end)
    (default_case "default" @end)
  ]
)
(#set! scope.byLine))

((expression_switch_statement
 (default_case "default" @start)
 "}" @end
)
(#set! scope.byLine))


(type_switch_statement
  "switch"
  "{" @start
  "}" @end
)

((type_switch_statement
  (type_case
    "case"
    ":" @start
  )
  .
  [
    (type_case "case" @end)
    (default_case "default" @end)
  ]
)
(#set! scope.byLine))

(select_statement
  "select"
  "{" @start
  "}" @end
)

(func_literal
  "func"
  (block
    "{" @start
    "}" @end
  )
)

(for_statement
  "for"
  (block
    "{" @start
    "}" @end
  )
)

(type_declaration
  "type"
  (type_spec
    (struct_type
      (field_declaration_list
        "{" @start
        "}" @end
      )
    )
  )
)

(struct_type
  "struct"
  (field_declaration_list
    "{" @start
    "}" @end
  )
)

(type_declaration
  "type"
  (type_spec
    (interface_type
      "{" @start
      "}" @end
    )
  )
)

(interface_type
  "interface"
  "{" @start
  "}" @end
)
