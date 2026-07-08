import argparse
import threading
import webbrowser
from html import escape
from pathlib import Path
import tkinter as tk
from tkinter import filedialog
from urllib.parse import parse_qs
from wsgiref.simple_server import make_server

from step_q_annotator import annotate_file
from step_q_registry import ANNOTATOR_FIELD_ORDER, REGISTERED_FIELDS, get_enum_values
from validate_step_q import validate_file


WRITE_MODE_OPTIONS = (
    ("copy", "Create annotated copy"),
    ("original", "Modify original file"),
)


def choose_step_file(title: str) -> str:
    dialog_root = tk.Tk()
    dialog_root.withdraw()
    dialog_root.attributes("-topmost", True)
    try:
        selected_path = filedialog.askopenfilename(
            title=title,
            filetypes=[("STEP files", "*.step *.stp *.STEP *.STP"), ("All files", "*.*")],
        )
    finally:
        dialog_root.destroy()
    return selected_path


def load_write_fields_from_step_file(form_values: dict[str, str], source_path: Path) -> None:
    report = validate_file(source_path, set())
    loaded_field_names: list[str] = []

    for field_name in ANNOTATOR_FIELD_ORDER:
        loaded_value = report["fields"].get(field_name, "")
        form_values[f"write_{field_name}"] = loaded_value
        if loaded_value:
            loaded_field_names.append(field_name)

    form_values["write_loaded_fields"] = "|".join(loaded_field_names)


def render_metadata_field(input_name: str, field_name: str, current_value: str) -> str:
    definition = REGISTERED_FIELDS[field_name]
    field_type = definition["type"]
    label = escape(field_name)
    value = escape(current_value)

    if field_type == "Enum":
        options = ["<option value=''>- optional -</option>"]
        for enum_value in get_enum_values(field_name):
            selected = " selected" if enum_value == current_value else ""
            options.append(
                f"<option value='{escape(enum_value)}'{selected}>{escape(enum_value)}</option>"
            )
        return (
            f"<label><span>{label}</span>"
            f"<select name='{escape(input_name)}'>"
            + "".join(options)
            + "</select></label>"
        )

    input_type = "text"
    if field_type in {"Integer", "Float"}:
        input_type = "number"
    elif field_type == "Date":
        input_type = "date"

    step_attr = " step='any'" if field_type == "Float" else ""
    min_attr = " min='0'" if field_type in {"Integer", "Float"} else ""
    return (
        f"<label><span>{label}</span>"
        f"<input type='{input_type}' name='{escape(input_name)}' value='{value}'{step_attr}{min_attr}></label>"
    )


def render_message_list(messages: list[dict]) -> str:
    if not messages:
        return "<p class='hint'>No validator messages.</p>"

    items = "".join(
        f"<li><strong>{escape(message['level'])}</strong>: {escape(message['message'])}</li>"
        for message in messages
    )
    return f"<ul>{items}</ul>"


def render_field_summary(fields: dict[str, str]) -> str:
    if not fields:
        return "<p class='hint'>No STEP-Q fields found.</p>"

    rows = "".join(
        f"<dt>{escape(field_name)}</dt><dd>{escape(field_value)}</dd>"
        for field_name, field_value in fields.items()
    )
    return f"<dl class='field-list'>{rows}</dl>"


def render_write_result(report: dict, result_meta: dict[str, str]) -> str:
    suffix_markup = ""
    if result_meta.get("copy_suffix"):
        suffix_markup = f"<p><strong>Copy suffix:</strong> {escape(result_meta['copy_suffix'])}</p>"

    return (
        "<section class='result'><h3>Write Result</h3>"
        f"<p><strong>Action:</strong> {escape(result_meta['action'])}</p>"
        f"<p><strong>Source:</strong> {escape(result_meta['source_path'])}</p>"
        f"<p><strong>Written file:</strong> {escape(result_meta['written_path'])}</p>"
        f"{suffix_markup}"
        f"<p><strong>Conformance:</strong> {escape(report['conformance'])}</p>"
        f"<p><strong>Errors:</strong> {report['errors']}<br><strong>Warnings:</strong> {report['warnings']}</p>"
        f"<p><strong>Written fields:</strong> {', '.join(escape(name) for name in report['fields'].keys()) or 'none'}</p>"
        f"{render_message_list(report['messages'])}"
        "</section>"
    )


def render_read_result(report: dict, result_meta: dict[str, str]) -> str:
    return (
        "<section class='result'><h3>Read Result</h3>"
        f"<p><strong>Source:</strong> {escape(result_meta['source_path'])}</p>"
        f"<p><strong>Conformance:</strong> {escape(report['conformance'])}</p>"
        f"<p><strong>Errors:</strong> {report['errors']}<br><strong>Warnings:</strong> {report['warnings']}</p>"
        "<p><strong>Extracted fields:</strong></p>"
        f"{render_field_summary(report['fields'])}"
        f"{render_message_list(report['messages'])}"
        "</section>"
    )


def render_page(
    form_values: dict[str, str],
    write_result: dict | None = None,
    write_error: str | None = None,
    write_result_meta: dict[str, str] | None = None,
    read_result: dict | None = None,
    read_error: str | None = None,
    read_result_meta: dict[str, str] | None = None,
) -> bytes:
    current_write_mode = form_values.get("write_mode", "original")
    loaded_write_fields = [
        field_name for field_name in form_values.get("write_loaded_fields", "").split("|") if field_name
    ]
    write_mode_options = "".join(
        (
            f"<option value='{escape(value)}'"
            + (" selected" if value == current_write_mode else "")
            + f">{escape(label)}</option>"
        )
        for value, label in WRITE_MODE_OPTIONS
    )
    write_fields_markup = "".join(
        render_metadata_field(f"write_{field_name}", field_name, form_values.get(f"write_{field_name}", ""))
        for field_name in ANNOTATOR_FIELD_ORDER
    )
    copy_notice_class = "mode-note" if current_write_mode == "copy" else "mode-note hidden"
    original_notice_class = "mode-note warning" if current_write_mode == "original" else "mode-note warning hidden"
    suffix_row_class = "" if current_write_mode == "copy" else "hidden"
    write_error_markup = f"<p class='error'>{escape(write_error)}</p>" if write_error else ""
    read_error_markup = f"<p class='error'>{escape(read_error)}</p>" if read_error else ""
    write_result_markup = (
        render_write_result(write_result, write_result_meta or {}) if write_result is not None else ""
    )
    read_result_markup = (
        render_read_result(read_result, read_result_meta or {}) if read_result is not None else ""
    )
    loaded_fields_warning = ""
    if loaded_write_fields:
        loaded_fields_text = ", ".join(escape(field_name) for field_name in loaded_write_fields)
        loaded_fields_warning = (
            "<p class='warning-note'><strong>Existing STEP-Q values loaded:</strong> "
            f"{loaded_fields_text}. Writing will overwrite these values in the selected target file.</p>"
        )

    html = f"""
<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
    <title>STEP-Q Workbench</title>
  <style>
    body {{ font-family: Segoe UI, Arial, sans-serif; margin: 2rem auto; max-width: 78rem; line-height: 1.45; padding: 0 1rem; }}
    form {{ display: block; }}
    .workspace {{ display: grid; gap: 1.5rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    .panel {{ border: 1px solid #c8ced8; padding: 1.25rem; background: #fbfcfe; }}
    fieldset {{ border: 1px solid #d7dee8; padding: 1rem; margin: 0 0 1rem; }}
    label {{ display: grid; gap: 0.25rem; }}
    .metadata-grid {{ display: grid; gap: 0.75rem; }}
    .file-picker-row {{ display: flex; gap: 0.75rem; align-items: end; }}
    .file-picker-row label {{ flex: 1; }}
    .file-picker-row button {{ white-space: nowrap; }}
    input, select, button {{ font: inherit; padding: 0.55rem; }}
    .panel button {{ margin-top: 0.5rem; }}
    .error {{ color: #9b1c1c; font-weight: 600; }}
    .hint {{ color: #445; }}
    .mode-note {{ margin: 0.35rem 0; color: #445; font-size: 0.95rem; }}
    .warning {{ color: #7a2e0b; }}
    .hidden {{ display: none; }}
    .result {{ margin-top: 1rem; padding: 1rem; background: #f4f7fb; border: 1px solid #d7e2f0; }}
    .field-list {{ display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 0.75rem; margin: 0; }}
    .field-list dt {{ font-weight: 600; }}
    .field-list dd {{ margin: 0; }}
        .warning-note {{ margin: 0.9rem 0 0; padding: 0.85rem 1rem; background: #fff4e8; border: 1px solid #f0c7a1; color: #7a2e0b; }}
    @media (max-width: 960px) {{
      .workspace {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
    <h1>STEP-Q Workbench</h1>
    <p class='hint'>Use the left panel to write STEP-Q data into a selected STEP file. Use the right panel to inspect an existing STEP file and read back STEP-Q metadata. The layout collapses to one column on narrower screens.</p>
  <form method='post'>
    <div class='workspace'>
      <section class='panel'>
        <h2>Write</h2>
        <p class='hint'>Choose a STEP file, decide whether to modify the original or create a copy, then write STEP-Q metadata.</p>
        {write_error_markup}
        <fieldset>
          <legend>File</legend>
          <div class='file-picker-row'>
            <label><span>Source STEP path</span><input type='text' name='write_source_path' value='{escape(form_values.get('write_source_path', ''))}' placeholder='Choose a STEP file...' readonly></label>
            <button type='submit' name='form_action' value='browse_write'>Choose STEP file...</button>
          </div>
          <label><span>Write mode</span><select name='write_mode'>{write_mode_options}</select></label>
          <p id='copy-mode-note' class='{copy_notice_class}'>Copy mode keeps the original file unchanged and requires a suffix such as <code>.rfq</code> or <code>.supplierA</code>.</p>
          <p id='original-mode-note' class='{original_notice_class}'>Original mode overwrites the selected STEP file in place.</p>
          <label id='copy-suffix-row' class='{suffix_row_class}'><span>Copy suffix</span><input id='copy-suffix' type='text' name='write_copy_suffix' value='{escape(form_values.get('write_copy_suffix', '.annotated'))}' placeholder='Required for copies, e.g. .rfq'></label>
                    <input type='hidden' name='write_loaded_fields' value='{escape(form_values.get('write_loaded_fields', ''))}'>
        </fieldset>
        <fieldset>
          <legend>STEP-Q Metadata</legend>
          <div class='metadata-grid'>
            {write_fields_markup}
          </div>
                    {loaded_fields_warning}
        </fieldset>
        <button type='submit' name='form_action' value='write'>Write and Validate</button>
        {write_result_markup}
      </section>
      <section class='panel'>
        <h2>Read</h2>
        <p class='hint'>Choose a STEP file and read back STEP-Q metadata plus the current conformance status. This panel never modifies the file.</p>
        {read_error_markup}
        <fieldset>
          <legend>Source</legend>
          <div class='file-picker-row'>
            <label><span>Source STEP path</span><input type='text' name='read_source_path' value='{escape(form_values.get('read_source_path', ''))}' placeholder='Choose a STEP file...' readonly></label>
            <button type='submit' name='form_action' value='browse_read'>Choose STEP file...</button>
          </div>
        </fieldset>
        <button type='submit' name='form_action' value='read'>Read STEP-Q Data</button>
        {read_result_markup}
      </section>
    </div>
  </form>
  <script>
    const writeModeSelect = document.querySelector("select[name='write_mode']");
    const copySuffixRow = document.getElementById("copy-suffix-row");
    const copyModeNote = document.getElementById("copy-mode-note");
    const originalModeNote = document.getElementById("original-mode-note");

    function syncWriteModeUi() {{
      const copyMode = writeModeSelect.value === "copy";
      copySuffixRow.classList.toggle("hidden", !copyMode);
      copyModeNote.classList.toggle("hidden", !copyMode);
      originalModeNote.classList.toggle("hidden", copyMode);
    }}

    writeModeSelect.addEventListener("change", syncWriteModeUi);
    syncWriteModeUi();
  </script>
</body>
</html>
"""
    return html.encode("utf-8")


def application(environ, start_response):
    form_values: dict[str, str] = {}
    write_result = None
    write_error = None
    write_result_meta = None
    read_result = None
    read_error = None
    read_result_meta = None
    status = "200 OK"

    if environ["REQUEST_METHOD"] == "POST":
        request_size = int(environ.get("CONTENT_LENGTH") or 0)
        request_body = environ["wsgi.input"].read(request_size).decode("utf-8")
        parsed = parse_qs(request_body, keep_blank_values=True)
        form_values = {key: values[0] for key, values in parsed.items()}
        form_action = form_values.get("form_action", "")

        if form_action == "browse_write":
            selected_path = choose_step_file("Choose STEP file to write")
            if selected_path:
                form_values["write_source_path"] = selected_path
                load_write_fields_from_step_file(form_values, Path(selected_path))
        elif form_action == "browse_read":
            selected_path = choose_step_file("Choose STEP file to read")
            if selected_path:
                form_values["read_source_path"] = selected_path
        elif form_action == "write":
            try:
                source_path = Path(form_values.get("write_source_path", "")).expanduser()
                if not source_path.is_file():
                    raise ValueError("Choose a STEP file first using the Windows file dialog")

                write_mode = form_values.get("write_mode", "original").strip().lower()
                copy_suffix = form_values.get("write_copy_suffix", "")
                metadata = {
                    field_name: value.strip()
                    for field_name in ANNOTATOR_FIELD_ORDER
                    if (value := form_values.get(f"write_{field_name}", "")).strip()
                }
                if not metadata:
                    raise ValueError("At least one STEP-Q field must be filled before writing")

                written_path = annotate_file(source_path, metadata, write_mode=write_mode, copy_suffix=copy_suffix)
                write_result = validate_file(written_path, set())
                write_result_meta = {
                    "action": "Original file updated" if write_mode == "original" else "Annotated copy created",
                    "source_path": str(source_path),
                    "written_path": str(written_path),
                    "copy_suffix": copy_suffix.strip() if write_mode == "copy" else "",
                }
            except Exception as error:
                write_error = str(error)
                status = "400 Bad Request"
        elif form_action == "read":
            try:
                source_path = Path(form_values.get("read_source_path", "")).expanduser()
                if not source_path.is_file():
                    raise ValueError("Choose a STEP file first using the Windows file dialog")

                read_result = validate_file(source_path, set())
                read_result_meta = {"source_path": str(source_path)}
            except Exception as error:
                read_error = str(error)
                status = "400 Bad Request"

    response_body = render_page(
        form_values,
        write_result=write_result,
        write_error=write_error,
        write_result_meta=write_result_meta,
        read_result=read_result,
        read_error=read_error,
        read_result_meta=read_result_meta,
    )
    start_response(status, [("Content-Type", "text/html; charset=utf-8")])
    return [response_body]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local STEP-Q read/write workbench.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    args = parser.parse_args()

    with make_server(args.host, args.port, application) as server:
        threading.Timer(0.5, lambda: webbrowser.open(f"http://{args.host}:{args.port}")).start()
        print(f"STEP-Q workbench available at http://{args.host}:{args.port}")
        server.serve_forever()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())