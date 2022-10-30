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
(#set! role function)
)

(function_declaration
  (identifier) @structure.anchor
  (parameter_list
    "(" @start
    ("," @structure.separator (_))*
    ")" @end
  )
)

(method_declaration
  "func"
  body: (block
    "{" @start
    "}" @end
  )
)

(call_expression
  function: (_) @structure.anchor
  (argument_list
    "(" @start
    ("," @structure.separator (_))*
    ","? @structure.separator
    ")" @end
  )
)

(composite_literal
  type: (_) @structure.anchor
  body: (literal_value
    "{" @start
    ("," @structure.separator (_)?)*
    "}" @end
  )
)

(literal_value
 "{" @start
 ("," @structure.separator (_)?)*
 "}" @end
)

((if_statement
  ["if" "else"]
  (block
    "{" @start
    "}" @end
  )
)
(#set! role block))

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
  "switch" @subtree
  ; "{" @start
  ; "}" @end
)

(expression_switch_statement
  (expression_case
    "case" @structure.anchor
    ":" @start
  )
  .
  [
    (expression_case "case" @structure.limit)
    (default_case "default" @structure.limit)
  ]
)

 (expression_switch_statement
   (default_case "default" @structure.anchor)
   "}" @structure.limit
 )

(type_switch_statement
  "switch" @subtree
  ; "{" @start
  ; "}" @end
)

(type_switch_statement
  (type_case
    "case" @structure.anchor
    ":" @start
  )
  .
  [
    (type_case "case" @structure.limit)
    (default_case "default" @structure.limit)
  ]
)

(select_statement
  "select" @subtree
  ; "{" @start
  ; "}" @end
)

(func_literal
  "func"
  (block
    ; "{" @start
    ; "}" @end
  ) @subtree
)

(for_statement
  "for"
  (block
    ; "{" @start
    ; "}" @end
  ) @subtree
)

(type_declaration
  "type"
  (type_spec
    (struct_type
      (field_declaration_list
        ; "{" @start
        ; "}" @end
      ) @subtree
    )
  )
)

(struct_type
  "struct"
  (field_declaration_list
    ; "{" @start
    ; "}" @end
  ) @subtree
)

(type_declaration
  "type"
  (type_spec
    (interface_type
      ; "{" @start
      ; "}" @end
    ) @subtree
  )
)

(interface_type
  "interface" @subtree
  ; "{" @start
  ; "}" @end
)
