"""Builds request bodies from the API's own OpenAPI schema, so every write
endpoint can be called with a valid, minimal payload without hand-writing
221 bodies. Field-specific rules (formats the schema can't express, e.g.
container numbers) live in FIELD_VALUES; tests override anything else."""
import datetime as _dt
import re
import secrets

TODAY = _dt.date.today()

# Values for fields whose validators need a specific shape.
FIELD_VALUES = {
    "container_number": lambda: "TWCU" + str(secrets.randbelow(9_000_000) + 1_000_000),
    "container_number_2": lambda: "TWCU" + str(secrets.randbelow(9_000_000) + 1_000_000),
    "email": lambda: f"pytest.{secrets.token_hex(3)}@example.com",
    "contact_number": lambda: "98" + str(secrets.randbelow(90_000_000) + 10_000_000),
    "phone": lambda: "98" + str(secrets.randbelow(90_000_000) + 10_000_000),
    "mobile": lambda: "98" + str(secrets.randbelow(90_000_000) + 10_000_000),
    "password": lambda: "Pytest#" + secrets.token_hex(6),
    "gstin": lambda: "33AAAAA" + str(secrets.randbelow(9000) + 1000) + "A1Z5",
    "pan": lambda: "AAAAA" + str(secrets.randbelow(9000) + 1000) + "A",
    "ifsc_code": lambda: "SBIN0001234",
    "pincode": lambda: "600001",
    "aadhar_number": lambda: "1234 5678 9012",
}


def _resolve(spec, schema):
    while "$ref" in schema:
        schema = spec["components"]["schemas"][schema["$ref"].split("/")[-1]]
    if "allOf" in schema and len(schema["allOf"]) == 1:
        return _resolve(spec, schema["allOf"][0])
    return schema


def _pick_type(spec, schema):
    """anyOf/oneOf (Optional[...]) -> the first non-null option."""
    schema = _resolve(spec, schema)
    for key in ("anyOf", "oneOf"):
        if key in schema:
            options = [o for o in schema[key] if _resolve(spec, o).get("type") != "null"]
            if options:
                return _resolve(spec, options[0])
    return schema


def value_for(spec, name, schema, depth=0):
    if name in FIELD_VALUES:
        return FIELD_VALUES[name]()
    schema = _pick_type(spec, schema)
    if "enum" in schema:
        return schema["enum"][0]
    if "const" in schema:
        return schema["const"]
    if "default" in schema and schema["default"] is not None:
        return schema["default"]
    typ = schema.get("type")
    fmt = schema.get("format")
    if typ == "string":
        if fmt == "date":
            return TODAY.isoformat()
        if fmt == "date-time":
            return _dt.datetime.now().replace(microsecond=0).isoformat()
        if fmt == "binary":
            return "file"
        pattern = schema.get("pattern")
        if pattern and re.fullmatch(pattern, "TN01AB1234"):
            return "TN01AB1234"
        text = f"PT {name.replace('_', ' ')} {secrets.token_hex(2)}"
        limit = schema.get("maxLength")
        return text[:limit] if limit else text
    if typ == "integer":
        return max(int(schema.get("minimum", 1)), int(schema.get("exclusiveMinimum", 0)) + 1, 1)
    if typ == "number":
        return max(float(schema.get("minimum", 10)), 10.0)
    if typ == "boolean":
        return False
    if typ == "array":
        if depth > 2 or not schema.get("minItems"):
            return []
        return [value_for(spec, name, schema.get("items", {}), depth + 1)]
    if typ == "object" or "properties" in schema:
        return build(spec, schema, depth + 1)
    return None


def build(spec, schema, depth=0, everything=False):
    """A body with every required field (every field when everything=True)."""
    schema = _resolve(spec, schema)
    props = schema.get("properties", {})
    wanted = props if everything else {k: props[k] for k in schema.get("required", []) if k in props}
    return {k: value_for(spec, k, v, depth) for k, v in wanted.items()}


def body_for(spec, method, path, **overrides):
    """(kind, body): kind is "json", "form", "multipart" or None."""
    op = spec["paths"][path][method.lower()]
    content = op.get("requestBody", {}).get("content", {})
    for ctype, media in content.items():
        schema = media.get("schema", {})
        body = build(spec, schema)
        if _resolve(spec, schema).get("type") == "array":
            body = []
        if isinstance(body, dict):
            body.update(overrides)
        kind = "json" if "json" in ctype else "multipart" if "multipart" in ctype else "form"
        return kind, body
    return None, None
