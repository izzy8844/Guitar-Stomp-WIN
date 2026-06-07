"""
Scan Neural DSP plugin preset directories for .xml binary preset files.
Extracts preset names, UIDs (via juce_hash_code_64 on absolute path), and source categories.

Key insight: Neural DSP plugins use juce_hash_code_64(absolute_disk_path) as the preset UID
for MIDI mappings. The stored presetUIDProp in the binary file reflects this same hash
(computed from the path the plugin originally saw when the preset was created/moved).
"""
from pathlib import Path
from typing import List
from ..config import NEURAL_DSP_PRESETS, MAPPING_DIR
from ..models import PresetInfo, PluginInfo
from .preset_uid import extract_preset_uid, juce_hash_code_64, compute_preset_id_from_file


def scan_plugins() -> List[PluginInfo]:
    """Scan for installed Neural DSP plugins."""
    plugins = []
    if not NEURAL_DSP_PRESETS.exists():
        return plugins

    for entry in sorted(NEURAL_DSP_PRESETS.iterdir()):
        if entry.is_dir() and not entry.name.startswith('.'):
            presets = _scan_plugin_presets_raw(entry.name)
            if presets:
                plugins.append(PluginInfo(
                    name=entry.name,
                    path=str(entry),
                    preset_count=len(presets),
                    has_mapping=_has_mapping(entry.name)
                ))
    return plugins


def scan_presets(plugin_name: str, source: str | None = None) -> List[PresetInfo]:
    """
    Scan presets for a specific plugin with full UID extraction.
    UID is computed as juce_hash_code_64(absolute_file_path) — this is what the plugin
    uses internally for MIDI mapping.

    Args:
        plugin_name: Neural DSP plugin folder name
        source: Optional filter — "user", "artists", "factory", or None for all
    """
    raw = _scan_plugin_presets_raw(plugin_name)
    results = []
    seen_names = set()

    for f in sorted(set(raw), key=lambda x: x.stem):
        filepath = str(f)
        preset_source = _get_source(plugin_name, f)

        # Apply source filter BEFORE dedup so filtered-out names don't block matching ones
        if source:
            if source.lower() not in preset_source.lower():
                continue

        # Compute UID from disk path (primary method for MIDI mapping)
        uid_from_path = juce_hash_code_64(filepath)

        # Also try to extract stored UID from binary file
        info = extract_preset_uid(filepath)
        name = info.get("name", f.stem)

        # Deduplicate by name (within the filtered set)
        if name in seen_names:
            continue
        seen_names.add(name)

        results.append(PresetInfo(
            name=name,
            path=filepath,
            source=preset_source,
            uid=str(uid_from_path),
        ))
    return results


def _scan_plugin_presets_raw(plugin_name: str) -> List[Path]:
    """Walk User/, Artists/, Neural DSP/, Factory/ subdirs for .xml files."""
    plugin_dir = NEURAL_DSP_PRESETS / plugin_name
    if not plugin_dir.exists():
        return []
    presets = []
    for subdir_name in ("User", "Artists", "Neural DSP", "Factory"):
        subdir = plugin_dir / subdir_name
        if subdir.exists():
            presets.extend(subdir.rglob("*.xml"))
    # Also check Presets/ subdirectory
    pd = plugin_dir / "Presets"
    if pd.exists():
        presets.extend(pd.rglob("*.xml"))
    return presets


def _get_source(plugin_name: str, filepath: Path) -> str:
    """Determine preset source category from path."""
    plugin_dir = NEURAL_DSP_PRESETS / plugin_name
    try:
        rel = filepath.parent.relative_to(plugin_dir)
        return str(rel) if rel != Path() else "User"
    except ValueError:
        return "User"


def _has_mapping(plugin_name: str) -> bool:
    return any(MAPPING_DIR.glob(f"{plugin_name}*/*.xml")) if MAPPING_DIR.exists() else False
