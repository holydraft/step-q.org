const FIELD_DEFINITIONS = {
  Q_PART_ID: { type: 'String' },
  Q_MATERIAL: { type: 'String' },
  Q_PRIMARY_PROCESS: {
    type: 'Enum',
    values: ['laser_cutting','bending','punching','milling','turning','grinding','additive','casting','forging','hybrid']
  },
  Q_QUANTITY: { type: 'Integer', min: 1 },
  Q_DRAWING_REFERENCE: { type: 'String' },
  Q_SURFACE: {
    type: 'Enum',
    values: ['raw','deburred','brushed','polished','powder_coated','anodized','galvanized','passivated','painted']
  },
  Q_TOLERANCE_CLASS: {
    type: 'Enum',
    values: ['ISO2768-f','ISO2768-m','ISO2768-c','ISO2768-v','custom']
  },
  Q_CERTIFICATE: {
    type: 'Enum',
    values: ['none','EN10204-2.1','EN10204-3.1','EN10204-3.2']
  },
  Q_THREAD_SPEC: { type: 'String' },
  Q_THREAD_DEPTH: { type: 'Float', min: 0 }
};

const FIELD_ORDER = [
  'Q_PART_ID',
  'Q_MATERIAL',
  'Q_PRIMARY_PROCESS',
  'Q_QUANTITY',
  'Q_DRAWING_REFERENCE',
  'Q_SURFACE',
  'Q_TOLERANCE_CLASS',
  'Q_CERTIFICATE',
  'Q_THREAD_SPEC',
  'Q_THREAD_DEPTH'
];

const fileInput = document.getElementById('stepFile');
const loadButton = document.getElementById('loadButton');
const annotateButton = document.getElementById('annotateButton');
const statusBox = document.getElementById('status');
const metadataFields = document.getElementById('metadataFields');
const writeMode = document.getElementById('writeMode');
const copySuffix = document.getElementById('copySuffix');

let currentText = '';
let currentFileName = '';
let currentMetadata = {};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showStatus(message, kind = 'info') {
  statusBox.classList.remove('hidden');
  statusBox.className = `result ${kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : ''}`;
  statusBox.innerHTML = message;
}

function renderMetadataFields() {
  metadataFields.innerHTML = '';
  const fragment = document.createDocumentFragment();

  FIELD_ORDER.forEach((fieldName) => {
    const definition = FIELD_DEFINITIONS[fieldName];
    const wrapper = document.createElement('div');
    const label = document.createElement('label');
    label.innerHTML = `<span>${escapeHtml(fieldName)}</span>`;

    if (definition.type === 'Enum') {
      const select = document.createElement('select');
      select.dataset.field = fieldName;
      const blankOption = document.createElement('option');
      blankOption.value = '';
      blankOption.textContent = '- optional -';
      select.appendChild(blankOption);
      definition.values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        if (currentMetadata[fieldName] === value) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      label.appendChild(select);
    } else {
      const input = document.createElement('input');
      input.type = definition.type === 'Integer' ? 'number' : definition.type === 'Float' ? 'number' : 'text';
      input.step = definition.type === 'Float' ? 'any' : '1';
      input.dataset.field = fieldName;
      input.value = currentMetadata[fieldName] || '';
      label.appendChild(input);
    }

    wrapper.appendChild(label);
    fragment.appendChild(wrapper);
  });

  metadataFields.appendChild(fragment);
}

function extractExistingMetadata(text) {
  const metadata = {};
  const entityPattern = /#\d+\s*=\s*DESCRIPTIVE_REPRESENTATION_ITEM\s*\(\s*'([A-Z0-9_]+)'\s*,\s*'((?:[^']|'')*)'\s*\)\s*;/gi;
  let match;
  while ((match = entityPattern.exec(text)) !== null) {
    const fieldName = match[1].toUpperCase();
    if (FIELD_DEFINITIONS[fieldName]) {
      metadata[fieldName] = match[2].replace(/''/g, "'");
    }
  }
  return metadata;
}

function collectMetadata() {
  const metadata = {};
  metadataFields.querySelectorAll('[data-field]').forEach((element) => {
    const key = element.dataset.field;
    const value = element.value.trim();
    if (value) {
      metadata[key] = value;
    }
  });
  currentMetadata = metadata;
  return metadata;
}

function validateField(fieldName, value) {
  const definition = FIELD_DEFINITIONS[fieldName];
  if (!definition) {
    return [];
  }
  const messages = [];
  if (definition.type === 'String') {
    if (/[\x00-\x1F]/.test(value)) {
      messages.push(`${fieldName}: String value contains control characters`);
    }
  } else if (definition.type === 'Integer') {
    if (!/^\d+$/.test(value)) {
      messages.push(`${fieldName}: Integer value must be base-10 without decimals`);
    } else if (Number(value) < (definition.min || 0)) {
      messages.push(`${fieldName}: Integer value is below the allowed minimum`);
    }
  } else if (definition.type === 'Float') {
    if (!/^[-+]?\d*(\.\d+)?$/.test(value)) {
      messages.push(`${fieldName}: Float value must use dot notation`);
    } else if (!Number.isFinite(Number(value)) || Number(value) < (definition.min || 0)) {
      messages.push(`${fieldName}: Float value is below the allowed minimum`);
    }
  } else if (definition.type === 'Enum') {
    if (value && !definition.values.includes(value)) {
      messages.push(`${fieldName}: Enum value is not registered`);
    }
  }
  return messages;
}

function inferDataBounds(text) {
  const upper = text.toUpperCase();
  const dataStart = upper.indexOf('DATA;');
  if (dataStart === -1) {
    throw new Error('STEP file does not contain a DATA section');
  }
  const contentStart = dataStart + 'DATA;'.length;
  const sectionEnd = upper.indexOf('ENDSEC;', contentStart);
  if (sectionEnd === -1) {
    throw new Error('STEP file DATA section is not properly terminated');
  }
  return { contentStart, sectionEnd };
}

function detectNewline(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function stripExistingStepQLines(dataSection) {
  return dataSection.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return trimmed && !/^#\d+\s*=\s*PROPERTY_SET\s*\(\s*'STEP-Q'/.test(trimmed) && !/^#\d+\s*=\s*DESCRIPTIVE_REPRESENTATION_ITEM\s*\(\s*'Q_[A-Z0-9_]+'/.test(trimmed);
  });
}

function allocateEntityIds(text, count) {
  const usedIds = new Set([...text.matchAll(/#(?<id>\d+)\s*=/g)].map((match) => Number(match.groups.id)));
  if (count <= 0) {
    return [];
  }
  const allocated = [];
  let currentId = 1;
  let maxUsedId = Math.max(...usedIds, 0);
  while (currentId <= maxUsedId && allocated.length < count) {
    if (!usedIds.has(currentId)) {
      allocated.push(currentId);
    }
    currentId += 1;
  }
  while (allocated.length < count) {
    maxUsedId += 1;
    allocated.push(maxUsedId);
  }
  return allocated;
}

function buildMetadataLines(entityIds, metadata) {
  const lines = [`#${entityIds[0]} = PROPERTY_SET ( 'STEP-Q', $, $ ) ;`];
  Object.entries(metadata).forEach(([fieldName, value], index) => {
    const escapedValue = String(value).replace(/'/g, "''");
    const entityId = entityIds[index + 1];
    lines.push(`#${entityId} = DESCRIPTIVE_REPRESENTATION_ITEM ( '${fieldName}', '${escapedValue}' ) ;`);
  });
  return lines;
}

function updateFileNameValue(text, outputName) {
  const escapedName = outputName.replace(/'/g, "''");
  const updatedText = text.replace(/(FILE_NAME\s*\(\s*')([^']*)(')/i, `$1${escapedName}$3`);
  if (updatedText === text) {
    throw new Error('STEP file HEADER does not contain a FILE_NAME entry');
  }
  return updatedText;
}

function updateFileDescriptionValue(text, newline) {
  const description = 'STEP file with STEP-Q metadata';
  const replacement = `FILE_DESCRIPTION (( '${description}' ),${newline}    '1' );`;
  const updatedText = text.replace(/FILE_DESCRIPTION\s*\(\s*\(\s*'(?:(?:[^']|'')*)'\s*\)\s*,\s*'(?:(?:[^']|'')*)'\s*\)\s*;/i, replacement);
  if (updatedText === text) {
    throw new Error('STEP file HEADER does not contain a FILE_DESCRIPTION entry');
  }
  return updatedText;
}

function annotateText(text, metadata, outputName) {
  if (!metadata || Object.keys(metadata).length === 0) {
    throw new Error('No STEP-Q metadata was provided for annotation');
  }
  const newline = detectNewline(text);
  const { contentStart, sectionEnd } = inferDataBounds(text);
  const dataSection = text.slice(contentStart, sectionEnd);
  const cleanedLines = stripExistingStepQLines(dataSection);
  const metadataEntityIds = allocateEntityIds(text, Object.keys(metadata).length + 1);
  const metadataLines = buildMetadataLines(metadataEntityIds, metadata);
  const cleanedSection = cleanedLines.filter((line) => line.trim()).join(newline);
  const rebuiltParts = [metadataLines.join(newline), cleanedSection].filter(Boolean);
  const rebuiltSection = newline + rebuiltParts.join(newline + newline) + newline;
  let annotatedText = text.slice(0, contentStart) + rebuiltSection + text.slice(sectionEnd);
  annotatedText = updateFileDescriptionValue(annotatedText, newline);
  return updateFileNameValue(annotatedText, outputName);
}

function buildDownloadName(fileName, mode) {
  const base = fileName.replace(/\.(step|stp)$/i, '');
  if (mode === 'original') {
    return `${base}.step`;
  }
  const suffix = copySuffix.value.trim() || '.annotated';
  const normalized = suffix.startsWith('.') ? suffix : `.${suffix}`;
  return `${base}${normalized}.step`;
}

function readAndValidateFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        currentText = text;
        currentFileName = file.name;
        const messages = [];
        if (!text.trim()) {
          messages.push('File is empty');
        }
        if (!text.includes('ISO-10303-21;')) {
          messages.push('Missing ISO-10303-21 header');
        }
        if (!text.includes('END-ISO-10303-21;')) {
          messages.push('Missing END-ISO-10303-21 trailer');
        }
        const dataBounds = inferDataBounds(text);
        if (dataBounds) {
          const dataSection = text.slice(dataBounds.contentStart, dataBounds.sectionEnd);
          const lines = dataSection.split(/\r?\n/);
          const metadataFieldsFound = [];
          lines.forEach((line) => {
            const trimmed = line.trim();
            if (/^#\d+\s*=\s*DESCRIPTIVE_REPRESENTATION_ITEM\s*\(\s*'Q_[A-Z0-9_]+'/.test(trimmed)) {
              const fieldMatch = trimmed.match(/'([A-Z0-9_]+)'/);
              if (fieldMatch) {
                metadataFieldsFound.push(fieldMatch[1]);
              }
            }
          });
          if (metadataFieldsFound.length === 0) {
            messages.push('No STEP-Q metadata fields found');
          }
        }
        const existingMetadata = extractExistingMetadata(text);
        currentMetadata = existingMetadata;
        renderMetadataFields();
        const metadata = collectMetadata();
        const validationMessages = [];
        Object.entries(metadata).forEach(([fieldName, value]) => {
          validationMessages.push(...validateField(fieldName, value));
        });
        if (validationMessages.length) {
          messages.push(...validationMessages);
        }
        resolve({ text, messages, existingMetadata });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file'));
    reader.readAsText(file);
  });
}

function renderSummary(messages) {
  const counts = {
    errors: messages.filter((entry) => entry.startsWith('Error')).length,
    warnings: messages.filter((entry) => entry.startsWith('Warning')).length,
    info: messages.filter((entry) => !entry.startsWith('Error') && !entry.startsWith('Warning')).length
  };
  return `<div class="summary"><span>Errors: ${counts.errors}</span><span>Warnings: ${counts.warnings}</span><span>Info: ${counts.info}</span></div>`;
}

loadButton.addEventListener('click', async () => {
  if (!fileInput.files || !fileInput.files[0]) {
    showStatus('Bitte wählen Sie zuerst eine STEP-Datei aus.', 'error');
    return;
  }

  try {
    const result = await readAndValidateFile(fileInput.files[0]);
    const loadedText = Object.keys(result.existingMetadata || {}).length
      ? `<strong>Vorhandene STEP-Q-Werte geladen.</strong><br>${Object.entries(result.existingMetadata).map(([field, value]) => `• ${escapeHtml(field)} = ${escapeHtml(value)}`).join('<br>')}`
      : '<strong>Keine vorhandenen STEP-Q-Werte gefunden.</strong>';
    const preview = result.messages.length > 0
      ? `${loadedText}<br><br><strong>Prüfung abgeschlossen.</strong><br>${result.messages.map((message) => `• ${escapeHtml(message)}`).join('<br>')}`
      : `${loadedText}<br><br><strong>Prüfung abgeschlossen.</strong> Keine Meldungen.`;
    showStatus(preview, 'info');
  } catch (error) {
    showStatus(`Fehler: ${escapeHtml(error.message)}`, 'error');
  }
});

annotateButton.addEventListener('click', async () => {
  if (!currentText) {
    showStatus('Bitte laden Sie zuerst eine STEP-Datei.', 'error');
    return;
  }

  try {
    const metadata = collectMetadata();
    if (!Object.keys(metadata).length) {
      showStatus('Bitte geben Sie mindestens ein STEP-Q-Feld ein.', 'error');
      return;
    }

    const annotatedText = annotateText(currentText, metadata, buildDownloadName(currentFileName, writeMode.value));
    const blob = new Blob([annotatedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildDownloadName(currentFileName, writeMode.value);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showStatus(`<strong>Download vorbereitet.</strong><br>Die annotierte Datei wurde als <code>${escapeHtml(link.download)}</code> erzeugt.`, 'info');
  } catch (error) {
    showStatus(`Fehler: ${escapeHtml(error.message)}`, 'error');
  }
});

renderMetadataFields();
