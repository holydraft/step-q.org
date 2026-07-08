import re
from pathlib import Path


ANNOTATION_WRITE_MODES = {"copy", "original"}
ENTITY_ID = re.compile(r"#(?P<id>[0-9]+)\s*=")
FILE_DESCRIPTION_BLOCK = re.compile(
    r"FILE_DESCRIPTION\s*\(\s*\(\s*'(?P<description>(?:[^']|'')*)'\s*\)\s*,\s*'(?P<level>(?:[^']|'')*)'\s*\)\s*;",
    re.IGNORECASE | re.DOTALL,
)
FILE_NAME_VALUE = re.compile(r"(FILE_NAME\s*\(\s*')(?P<name>[^']*)(')", re.IGNORECASE)
PROPERTY_SET_LINE = re.compile(r"^\s*#[0-9]+\s*=\s*PROPERTY_SET\s*\(\s*'STEP-Q'", re.IGNORECASE)
Q_FIELD_LINE = re.compile(
    r"^\s*#[0-9]+\s*=\s*DESCRIPTIVE_REPRESENTATION_ITEM\s*\(\s*'Q_[A-Z0-9_]+'",
    re.IGNORECASE,
)


def normalize_copy_suffix(copy_suffix: str) -> str:
    normalized_suffix = copy_suffix.strip()
    if not normalized_suffix:
        raise ValueError("A suffix is required when writing an annotated copy")
    if any(separator in normalized_suffix for separator in ("\\", "/", ":")):
        raise ValueError("The copy suffix must not contain path separators or drive markers")
    if normalized_suffix.upper().endswith((".STEP", ".STP")):
        raise ValueError("The copy suffix must be entered without the STEP file extension")
    if normalized_suffix in {".", ".."}:
        raise ValueError("The copy suffix is not valid")
    if not normalized_suffix.startswith("."):
        normalized_suffix = f".{normalized_suffix}"
    return normalized_suffix


def derive_copy_path(source_path: Path, copy_suffix: str) -> Path:
    normalized_suffix = normalize_copy_suffix(copy_suffix)
    if source_path.suffix.upper() in {".STEP", ".STP"}:
        return source_path.with_name(f"{source_path.stem}{normalized_suffix}{source_path.suffix.upper()}")
    return source_path.with_name(f"{source_path.name}{normalized_suffix}.STEP")


def next_available_output_path(target_path: Path) -> Path:
    if not target_path.exists():
        return target_path

    suffixes = target_path.suffixes
    if len(suffixes) >= 2 and suffixes[-1].upper() in {".STEP", ".STP"}:
        final_suffix = "".join(suffixes[-2:])
        base_name = target_path.name[: -len(final_suffix)]
    else:
        final_suffix = target_path.suffix
        base_name = target_path.stem

    counter = 1
    while True:
        candidate = target_path.with_name(f"{base_name}({counter}){final_suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def detect_newline(text: str) -> str:
    return "\r\n" if "\r\n" in text else "\n"


def find_data_bounds(text: str) -> tuple[int, int]:
    upper_text = text.upper()
    data_start = upper_text.find("DATA;")
    if data_start == -1:
        raise ValueError("STEP file does not contain a DATA section")

    data_content_start = data_start + len("DATA;")
    section_end = upper_text.find("ENDSEC;", data_content_start)
    if section_end == -1:
        raise ValueError("STEP file DATA section is not properly terminated")

    return data_content_start, section_end


def allocate_entity_ids(text: str, count: int) -> list[int]:
    used_ids = {int(match.group("id")) for match in ENTITY_ID.finditer(text)}
    if count <= 0:
        return []

    allocated: list[int] = []
    current_id = 1
    max_used_id = max(used_ids, default=0)

    while current_id <= max_used_id and len(allocated) < count:
        if current_id not in used_ids:
            allocated.append(current_id)
        current_id += 1

    while len(allocated) < count:
        max_used_id += 1
        allocated.append(max_used_id)

    return allocated


def strip_existing_step_q_lines(data_section: str) -> list[str]:
    remaining_lines: list[str] = []
    for line in data_section.splitlines():
        if PROPERTY_SET_LINE.match(line) or Q_FIELD_LINE.match(line):
            continue
        remaining_lines.append(line)
    return remaining_lines


def build_metadata_lines(entity_ids: list[int], metadata: dict[str, str]) -> list[str]:
    if len(entity_ids) != len(metadata) + 1:
        raise ValueError("Entity ID allocation does not match metadata payload")

    lines = [f"#{entity_ids[0]} = PROPERTY_SET ( 'STEP-Q', $, $ ) ;"]

    for field_name, value, entity_id in zip(metadata.keys(), metadata.values(), entity_ids[1:]):
        escaped_value = value.replace("'", "''")
        lines.append(
            f"#{entity_id} = DESCRIPTIVE_REPRESENTATION_ITEM ( '{field_name}', '{escaped_value}' ) ;"
        )

    return lines


def update_file_name_value(text: str, output_name: str) -> str:
    escaped_name = output_name.replace("'", "''")
    updated_text, replacements = FILE_NAME_VALUE.subn(rf"\1{escaped_name}\3", text, count=1)
    if replacements == 0:
        raise ValueError("STEP file HEADER does not contain a FILE_NAME entry")
    return updated_text


def update_file_description_value(text: str, newline: str) -> str:
    description = "STEP file with STEP-Q metadata"
    replacement = f"FILE_DESCRIPTION (( '{description}' ),{newline}    '1' );"
    updated_text, replacements = FILE_DESCRIPTION_BLOCK.subn(replacement, text, count=1)
    if replacements == 0:
        raise ValueError("STEP file HEADER does not contain a FILE_DESCRIPTION entry")
    return updated_text


def annotate_text(text: str, metadata: dict[str, str], output_name: str) -> str:
    if not metadata:
        raise ValueError("No STEP-Q metadata was provided for annotation")

    newline = detect_newline(text)
    data_start_index, data_end_index = find_data_bounds(text)
    data_section = text[data_start_index:data_end_index]
    cleaned_lines = strip_existing_step_q_lines(data_section)
    metadata_entity_ids = allocate_entity_ids(text, len(metadata) + 1)
    metadata_lines = build_metadata_lines(metadata_entity_ids, metadata)

    cleaned_section = newline.join(line for line in cleaned_lines if line.strip())
    rebuilt_section_parts = [part for part in [newline.join(metadata_lines), cleaned_section] if part]
    rebuilt_section = newline + newline.join(rebuilt_section_parts) + newline

    annotated_text = text[:data_start_index] + rebuilt_section + text[data_end_index:]
    annotated_text = update_file_description_value(annotated_text, newline)
    return update_file_name_value(annotated_text, output_name)


def resolve_output_path(source_path: Path, write_mode: str, copy_suffix: str | None) -> Path:
    normalized_mode = write_mode.strip().lower()
    if normalized_mode not in ANNOTATION_WRITE_MODES:
        raise ValueError(f"Unsupported write mode: {write_mode}")
    if normalized_mode == "original":
        return source_path
    return next_available_output_path(derive_copy_path(source_path, copy_suffix or ""))


def annotate_file(
    source_path: Path,
    metadata: dict[str, str],
    write_mode: str = "copy",
    copy_suffix: str | None = ".annotated",
) -> Path:
    source_text = source_path.read_text(encoding="utf-8")
    resolved_output_path = resolve_output_path(source_path, write_mode, copy_suffix)
    annotated_text = annotate_text(source_text, metadata, resolved_output_path.name)
    resolved_output_path.write_text(annotated_text, encoding="utf-8")
    return resolved_output_path
