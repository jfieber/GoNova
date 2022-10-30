; Function calls

(call_expression
  function: (identifier) @identifier.function)

(call_expression
  function: (selector_expression
    field: (field_identifier) @identifier.method))

; Function definitions

(function_declaration
  name: (identifier) @definition.function)

(method_declaration
  name: (field_identifier) @definition.method)

; Identifiers

(type_identifier) @identifier.type
(field_identifier) @identifier.property
(identifier) @identifier

; Operators

[
  "--"
  "-"
  "-="
  ":="
  "!"
  "!="
  "..."
  "*"
  "*"
  "*="
  "/"
  "/="
  "&"
  "&&"
  "&="
  "%"
  "%="
  "^"
  "^="
  "+"
  "++"
  "+="
  "<-"
  "<"
  "<<"
  "<<="
  "<="
  "="
  "=="
  ">"
  ">="
  ">>"
  ">>="
  "|"
  "|="
  "||"
  "~"
] @operator

; Keywords

[
  "case"
  "else"
  "if"
  "switch"
  "break"
  "continue"
  "for"
] @keyword.condition

[
  "func"
  "struct"
  "type"
  "package"
  "interface"
] @keyword.construct

[
  "chan"
  "const"
  "default"
  "defer"
  "fallthrough"
  "go"
  "goto"
  "import"
  "map"
  "range"
  "return"
  "select"
  "var"
] @keyword

; Literals

[
  (interpreted_string_literal)
  (raw_string_literal)
  (rune_literal)
] @string

(escape_sequence) @escape

[
  (int_literal)
  (float_literal)
  (imaginary_literal)
] @value.number

[
  (true)
  (false)
] @value.boolean

[
  (iota)
] @identifier.constant

[
  (nil)
] @value.null


(comment) @comment

[
  "("
  ")"
  "{"
  "}"
  "["
  "]"
] @bracket
