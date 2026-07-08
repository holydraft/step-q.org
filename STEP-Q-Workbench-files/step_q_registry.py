"""Shared STEP-Q field registry used by the draft reference tools.

The normative field and enumeration definitions live in spec/fields.md and
spec/enumerations.md. This module is the tool-facing registry for the current
v0.2 evaluation workflow.
"""

REGISTERED_FIELDS = {
    "Q_PART_ID": {"type": "String"},
    "Q_MATERIAL": {"type": "String"},
    "Q_PRIMARY_PROCESS": {
        "type": "Enum",
        "values": {
            "laser_cutting",
            "bending",
            "punching",
            "milling",
            "turning",
            "grinding",
            "additive",
            "casting",
            "forging",
            "hybrid",
        },
    },
    "Q_QUANTITY": {"type": "Integer", "min": 1},
    "Q_TOLERANCE_CLASS": {
        "type": "Enum",
        "values": {"ISO2768-f", "ISO2768-m", "ISO2768-c", "ISO2768-v", "custom"},
    },
    "Q_SURFACE": {
        "type": "Enum",
        "values": {
            "raw",
            "deburred",
            "brushed",
            "polished",
            "powder_coated",
            "anodized",
            "galvanized",
            "passivated",
            "painted",
        },
    },
    "Q_DRAWING_REFERENCE": {"type": "String"},
    "Q_TARGET_PRICE": {"type": "Float", "min": 0},
    "Q_DELIVERY_DATE": {"type": "Date"},
    "Q_CERTIFICATE": {
        "type": "Enum",
        "values": {"none", "EN10204-2.1", "EN10204-3.1", "EN10204-3.2"},
    },
    "Q_PACKAGING": {
        "type": "Enum",
        "values": {"bulk", "individual", "vacuum", "foam", "custom"},
    },
    "Q_COMMENTS": {"type": "String"},
    "Q_THREAD_SPEC": {"type": "String"},
    "Q_THREAD_DEPTH": {"type": "Float", "min": 0},
    "Q_HOLE_FINISH": {
        "type": "Enum",
        "values": {"drilled", "reamed", "tapped", "countersunk", "counterbored", "spotfaced"},
    },
    "Q_SURFACE_ROUGHNESS_RA": {"type": "Float", "min": 0},
    "Q_HEAT_TREATMENT": {
        "type": "Enum",
        "values": {
            "none",
            "stress_relieved",
            "annealed",
            "normalized",
            "hardened",
            "tempered",
            "quenched_tempered",
            "case_hardened",
            "nitrided",
        },
    },
    "Q_HARDNESS": {"type": "String"},
    "Q_EDGE_BREAK": {"type": "String"},
    "Q_COATING_THICKNESS": {"type": "Float", "min": 0},
    "Q_FIT_CLASS": {"type": "String"},
    "Q_INSPECTION_LEVEL": {
        "type": "Enum",
        "values": {"none", "visual", "sampling", "first_article", "full_dimension", "cmm_critical"},
    },
}

ANNOTATOR_FIELD_ORDER = [
    "Q_PART_ID",
    "Q_MATERIAL",
    "Q_PRIMARY_PROCESS",
    "Q_QUANTITY",
    "Q_DRAWING_REFERENCE",
    "Q_SURFACE",
    "Q_TOLERANCE_CLASS",
    "Q_CERTIFICATE",
    "Q_THREAD_SPEC",
    "Q_THREAD_DEPTH",
]


def get_enum_values(field_name: str) -> list[str]:
    definition = REGISTERED_FIELDS.get(field_name, {})
    values = definition.get("values", set())
    return sorted(values)
