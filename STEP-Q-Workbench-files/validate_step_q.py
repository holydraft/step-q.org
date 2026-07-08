import argparse
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from step_q_registry import REGISTERED_FIELDS

ASSIGNMENT_STATEMENT = re.compile(
    r"#(?P<id>[0-9]+)\s*=\s*(?P<body>.+)\s*;",
    re.IGNORECASE,
)

ENTITY_INSTANCE = re.compile(
    r"#(?P<id>[0-9]+)\s*=\s*(?P<name>[A-Z0-9_]+)\s*\((?P<args>.*)\)\s*;",
    re.IGNORECASE,
)


@dataclass
class Message:
    level: str
    field: str | None
    message: str

    def as_dict(self) -> dict:
        result = {"level": self.level, "message": self.message}
        if self.field:
            result["field"] = self.field
        return result


@dataclass
class StepEntity:
    entity_id: str
    name: str
    arguments: list[str]


def has_balanced_step_delimiters(text: str) -> bool:
    nested_depth = 0
    in_string = False
    index = 0

    while index < len(text):
        character = text[index]

        if character == "'":
            if in_string and index + 1 < len(text) and text[index + 1] == "'":
                index += 1
            else:
                in_string = not in_string
        elif not in_string and character == '(':
            nested_depth += 1
        elif not in_string and character == ')':
            nested_depth -= 1
            if nested_depth < 0:
                return False

        index += 1

    return not in_string and nested_depth == 0


def extract_data_section(text: str) -> str | None:
    upper_text = text.upper()
    data_start = upper_text.find("DATA;")
    if data_start == -1:
        return None

    section_start = data_start + len("DATA;")
    section_end = upper_text.find("ENDSEC;", section_start)
    if section_end == -1:
        return None

    return text[section_start:section_end]


def split_step_arguments(raw_arguments: str) -> list[str]:
    arguments: list[str] = []
    current: list[str] = []
    in_string = False
    nested_depth = 0
    index = 0

    while index < len(raw_arguments):
        character = raw_arguments[index]

        if character == "'":
            current.append(character)
            if in_string and index + 1 < len(raw_arguments) and raw_arguments[index + 1] == "'":
                current.append(raw_arguments[index + 1])
                index += 1
            else:
                in_string = not in_string
        elif not in_string and character == '(':
            nested_depth += 1
            current.append(character)
        elif not in_string and character == ')':
            nested_depth = max(0, nested_depth - 1)
            current.append(character)
        elif not in_string and nested_depth == 0 and character == ',':
            arguments.append("".join(current).strip())
            current = []
        else:
            current.append(character)

        index += 1

    remainder = "".join(current).strip()
    if remainder:
        arguments.append(remainder)

    return arguments


def parse_string_argument(value: str) -> str | None:
    stripped = value.strip()
    if len(stripped) < 2 or not stripped.startswith("'") or not stripped.endswith("'"):
        return None
    return stripped[1:-1].replace("''", "'")


def parse_step_entities(data_section: str) -> tuple[list[StepEntity], list[Message]]:
    entities: list[StepEntity] = []
    messages: list[Message] = []
    statement_parts: list[str] = []

    for line in data_section.splitlines():
        stripped_line = line.strip()
        if not stripped_line:
            continue

        statement_parts.append(stripped_line)
        if not stripped_line.endswith(';'):
            continue

        statement = " ".join(statement_parts)
        statement_parts = []
        match = ENTITY_INSTANCE.fullmatch(statement)
        if match:
            entities.append(
                StepEntity(
                    entity_id=match.group("id"),
                    name=match.group("name").upper(),
                    arguments=split_step_arguments(match.group("args")),
                )
            )
            continue

        assignment_match = ASSIGNMENT_STATEMENT.fullmatch(statement)
        if assignment_match and has_balanced_step_delimiters(assignment_match.group("body")):
            entities.append(
                StepEntity(
                    entity_id=assignment_match.group("id"),
                    name="COMPLEX_ENTITY",
                    arguments=[assignment_match.group("body").strip()],
                )
            )
            continue

        messages.append(Message("E", None, "Malformed STEP entity statement in DATA section"))

    if statement_parts:
        messages.append(Message("E", None, "Unterminated STEP entity statement in DATA section"))

    return entities, messages


def extract_metadata_fields(entities: list[StepEntity]) -> tuple[bool, dict[str, str]]:
    has_metadata_container = False
    fields: dict[str, str] = {}

    for entity in entities:
        if entity.name == "PROPERTY_SET" and entity.arguments:
            container_name = parse_string_argument(entity.arguments[0])
            if container_name == "STEP-Q":
                has_metadata_container = True
            continue

        if entity.name != "DESCRIPTIVE_REPRESENTATION_ITEM" or len(entity.arguments) < 2:
            continue

        field_name = parse_string_argument(entity.arguments[0])
        field_value = parse_string_argument(entity.arguments[1])
        if field_name is None or field_value is None or not field_name.upper().startswith("Q_"):
            continue

        fields[field_name.upper()] = field_value

    return has_metadata_container, fields


def validate_type(field: str, value: str) -> list[Message]:
    messages: list[Message] = []
    definition = REGISTERED_FIELDS[field]
    field_type = definition["type"]

    if field_type == "String":
        if any(ord(char) < 32 and char not in {"\t", "\n", "\r"} for char in value):
            messages.append(Message("E", field, "String value contains control characters"))
        return messages

    if field_type == "Integer":
        if not re.fullmatch(r"[0-9]+", value):
            messages.append(Message("E", field, "Integer value must be base-10 without decimals"))
            return messages
        if int(value) < definition.get("min", 0):
            messages.append(Message("E", field, "Integer value is below the allowed minimum"))
        return messages

    if field_type == "Float":
        try:
            parsed = float(value)
        except ValueError:
            messages.append(Message("E", field, "Float value must use dot notation"))
            return messages
        if not math.isfinite(parsed):
            messages.append(Message("E", field, "Float value must be finite"))
        if parsed < definition.get("min", 0):
            messages.append(Message("E", field, "Float value is below the allowed minimum"))
        return messages

    if field_type == "Enum":
        if value not in definition["values"]:
            messages.append(Message("E", field, "Enum value is not registered"))
        return messages

    if field_type == "Date":
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            messages.append(Message("E", field, "Date value must use YYYY-MM-DD format"))
        return messages

    return messages


def validate_file(path: Path, documented_extensions: set[str]) -> dict:
    text = path.read_text(encoding="utf-8")
    messages: list[Message] = []
    fields: dict[str, str] = {}

    stripped = text.strip()
    if not stripped:
        messages.append(Message("E", None, "File is empty"))
        return build_report(path, fields, messages)

    if not stripped.startswith("ISO-10303-21;"):
        messages.append(Message("E", None, "Missing ISO-10303-21 header"))
    if not stripped.endswith("END-ISO-10303-21;"):
        messages.append(Message("E", None, "Missing END-ISO-10303-21 trailer"))

    data_section = extract_data_section(text)
    if data_section is None:
        messages.append(Message("E", None, "Missing DATA section"))
        return build_report(path, fields, messages)

    entities, entity_messages = parse_step_entities(data_section)
    messages.extend(entity_messages)
    has_metadata_container, fields = extract_metadata_fields(entities)

    if not has_metadata_container:
        messages.append(Message("W", None, "STEP-Q PROPERTY_SET container not found"))

    for field, value in fields.items():

        if field not in REGISTERED_FIELDS:
            if field in documented_extensions:
                messages.append(Message("W", field, "Documented extension field is outside the registered core"))
            else:
                messages.append(Message("E", field, "Undocumented extension field is non-conformant"))
            continue

        messages.extend(validate_type(field, value))

    if not fields:
        messages.append(Message("W", None, "No STEP-Q metadata fields found"))

    return build_report(path, fields, messages)


def build_report(path: Path, fields: dict[str, str], messages: list[Message]) -> dict:
    errors = sum(1 for message in messages if message.level == "E")
    warnings = sum(1 for message in messages if message.level == "W")
    if errors:
        conformance = "non"
    elif warnings:
        conformance = "partial"
    else:
        conformance = "full"

    return {
        "file": str(path),
        "conformance": conformance,
        "errors": errors,
        "warnings": warnings,
        "fields": fields,
        "messages": [message.as_dict() for message in messages],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate STEP-Q draft metadata in STEP files.")
    parser.add_argument("files", nargs="+", help="STEP files to validate")
    parser.add_argument(
        "--documented-extension",
        action="append",
        default=[],
        help="Mark a Q_ field as a documented extension so it is reported as a warning instead of an error.",
    )
    args = parser.parse_args()

    documented_extensions = {field.upper() for field in args.documented_extension}
    reports = [validate_file(Path(file_name), documented_extensions) for file_name in args.files]
    print(json.dumps(reports, indent=2))
    return 1 if any(report["errors"] for report in reports) else 0


if __name__ == "__main__":
    raise SystemExit(main())