"""
MIDI XML Generator — 生成 Neural DSP 兼容的 MIDI 映射文件

核心机制：Neural DSP 插件使用 JUCE hashCode64(preset_absolute_path) 作为预设 ID。
本模块基于此算法，自动扫描预设 → 计算 ID → 生成合法的 XML 映射文件。

安装路径：~/Library/Application Support/Neural DSP/<PluginName>/MIDI Mappings/
（不是 ~/Library/Audio/Presets — 那里存的是预设文件本身）
"""
import os
import re
from pathlib import Path
from typing import Optional, List
from ..models import PresetMapping, MappingFileInfo, MappingTone
from ..config import MAPPING_DIR, MIDI_DEFAULT_CHANNEL, NEURAL_DSP_USER_CONFIG

# ── XML 模板 (匹配 Neural DSP 原生格式，包括空行和缩进) ──────────────────────

# 旧格式 (Fortin Nameless Suite X, Soldano 等)
OLD_XML_TEMPLATE = '<?xml version="1.0" encoding="UTF-8"?>\n\n<midi>\n  <routings>\n{routings}\n  </routings>\n</midi>\n'
OLD_ROUTING = '    <routing type="pc_preset" target="{uid}" midiChannel="{channel}"\n             data1="{pc}" data2="0" value="0.0" enabled="1"/>'

# 新格式 (Mesa Boogie, Archetype Nolly/Cory Wong 等)
NEW_XML_TEMPLATE = '<?xml version="1.0" encoding="UTF-8"?>\n\n<midi>\n<routings plugin_type="{plugin_type}" plugin_name="{plugin_name}" plugin_version="{plugin_version}">\n{routings}\n</routings>\n</midi>\n'
NEW_ROUTING = '    <routing type="pc_preset" channel="{channel}" enabled="1" program="{pc}" preset="{uid}"/>'


# ── 格式检测 ──────────────────────────────────────────────────────────────────

def _detect_plugin_format(plugin_name: str) -> tuple:
    """
    自动检测插件使用的 MIDI XML 格式。
    检查 ~/Library/Application Support/Neural DSP/<Plugin>/MIDI Mappings/ 中的已有文件。
    返回 (format, metadata)
    """
    plugin_config_dir = NEURAL_DSP_USER_CONFIG / plugin_name

    for subdir in ["MIDI Mappings", "MIDI"]:
        config_dir = plugin_config_dir / subdir
        if not config_dir.is_dir():
            continue
        for fname in os.listdir(config_dir):
            if not fname.lower().endswith(".xml"):
                continue
            # 忽略我们自己生成的文件，避免格式毒化
            if fname.endswith("_user.xml") or fname == "ToneMaster.xml":
                continue
            fpath = config_dir / fname
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue

            # 新格式: routings 元素带 plugin_type 属性
            meta_match = re.search(
                r'<routings\s+plugin_type="([^"]*)"\s+plugin_name="([^"]*)"\s+plugin_version="([^"]*)"',
                content
            )
            if meta_match:
                return "new", {
                    "plugin_type": meta_match.group(1),
                    "plugin_name": meta_match.group(2),
                    "plugin_version": meta_match.group(3),
                }

            # 旧格式: routing 元素用 target + data1
            if 'target="' in content and 'data1="' in content:
                return "old", {}

    # 默认: 如果存在 MIDI Mappings 目录 → 新格式，否则旧格式
    if (plugin_config_dir / "MIDI Mappings").is_dir():
        return "new", {
            "plugin_type": _derive_plugin_type(plugin_name),
            "plugin_name": plugin_name,
            "plugin_version": "1.0.0",
        }
    return "old", {}


def _derive_plugin_type(plugin_name: str) -> str:
    """从插件名推导 plugin_type（Neural DSP 内部标识）"""
    name = plugin_name.lower()
    name = re.sub(r'[^a-z0-9\s]', '', name)
    name = re.sub(r'\s+', '_', name)
    name = name.replace('mesa_boogie_', '').replace('archetype_', '').replace('fortin_', '')
    name = name.replace('_suite', '').replace('_x', '')
    name = name.replace('_iic', 'iic')
    return f"neural_dsp_{name}"


# ── XML 生成 ──────────────────────────────────────────────────────────────────

def generate_xml(plugin_name: str, mappings: List[PresetMapping], filename: Optional[str] = None) -> tuple:
    """Generate Neural DSP MIDI mapping XML. Returns (xml_string, filename)."""
    fmt, meta = _detect_plugin_format(plugin_name)

    if fmt == "new":
        xml_str = _generate_new_format(plugin_name, mappings, meta)
    else:
        xml_str = _generate_old_format(plugin_name, mappings)

    if not filename:
        # Default filename: {plugin-slug}_user.xml
        slug = re.sub(r'[^a-z0-9]+', '-', plugin_name.lower()).strip('-')
        filename = f"{slug}_user.xml"
    return xml_str, filename


def _generate_old_format(plugin_name: str, mappings: List[PresetMapping]) -> str:
    """Generate old format XML using string template (matching Neural DSP native output)."""
    routings = "\n".join(
        OLD_ROUTING.format(
            uid=m.uid or "",
            channel=str(MIDI_DEFAULT_CHANNEL),
            pc=str(m.pc)
        )
        for m in mappings
    )
    return OLD_XML_TEMPLATE.format(routings=routings)


def _generate_new_format(plugin_name: str, mappings: List[PresetMapping], meta: dict) -> str:
    """Generate new format XML using string template (matching Neural DSP native output)."""
    routings = "\n".join(
        NEW_ROUTING.format(
            uid=m.uid or "",
            channel=str(MIDI_DEFAULT_CHANNEL),
            pc=str(m.pc)
        )
        for m in mappings
    )
    return NEW_XML_TEMPLATE.format(
        plugin_type=meta.get("plugin_type", _derive_plugin_type(plugin_name)),
        plugin_name=meta.get("plugin_name", plugin_name),
        plugin_version=meta.get("plugin_version", "1.0.0"),
        routings=routings,
    )


# ── 文件安装 ──────────────────────────────────────────────────────────────────

def save_mapping(plugin_name: str, xml_content: str, filename: str) -> str:
    """
    Save mapping to Neural DSP plugin's MIDI config directory.
    Path: ~/Library/Application Support/Neural DSP/<Plugin>/MIDI Mappings/<filename>
    Also saves a backup to local project ./mappings/ dir.
    """
    # Save backup to local project dir
    plugin_dir = MAPPING_DIR / plugin_name
    plugin_dir.mkdir(parents=True, exist_ok=True)
    backup_path = plugin_dir / filename
    backup_path.write_text(xml_content, encoding="utf-8")

    # Install to Neural DSP plugin's MIDI config directory (Application Support)
    install_path = _install_to_plugin_dir(plugin_name, xml_content, filename)
    return install_path


def _install_to_plugin_dir(plugin_name: str, xml_content: str, filename: str) -> str:
    """Install XML to ~/Library/Application Support/Neural DSP/<Plugin>/MIDI Mappings/"""
    plugin_config_dir = NEURAL_DSP_USER_CONFIG / plugin_name

    # Check if plugin already has a MIDI directory (MIDI Mappings or MIDI)
    for subdir in ["MIDI Mappings", "MIDI"]:
        candidate = plugin_config_dir / subdir
        if candidate.is_dir():
            target_path = candidate / filename
            target_path.write_text(xml_content, encoding="utf-8")
            return str(target_path)

    # Default: create MIDI Mappings directory
    target_dir = plugin_config_dir / "MIDI Mappings"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / filename
    target_path.write_text(xml_content, encoding="utf-8")
    return str(target_path)


# ── Auto-map with UID lookup ──────────────────────────────────────────────────

def auto_map(preset_names: List[str], start_pc: int = 0) -> List[PresetMapping]:
    """Simple auto map without UID lookup (names only)."""
    return [PresetMapping(pc=start_pc + i, name=name) for i, name in enumerate(preset_names) if start_pc + i <= 127]


def auto_map_with_uids(plugin_name: str, preset_names: List[str], start_pc: int = 0) -> List[PresetMapping]:
    """
    Auto map WITH UID lookup: scan presets, compute hashCode64, assign PC numbers.
    This is what actually makes the XML work — without UIDs, the plugin can't match mappings to presets.
    """
    from .preset_scanner import scan_presets
    from .preset_uid import juce_hash_code_64, compute_preset_id_from_file

    # Scan all presets for this plugin
    all_presets = scan_presets(plugin_name)

    # Build name → preset lookup (case-insensitive)
    preset_map = {}
    for p in all_presets:
        preset_map[p.name.lower()] = p

    mappings = []
    for i, name in enumerate(preset_names):
        pc = start_pc + i
        if pc > 127:
            break

        preset = preset_map.get(name.lower())
        if preset and preset.uid:
            uid = preset.uid
        elif preset and preset.path:
            # Fallback: compute from file path
            uid_val = compute_preset_id_from_file(preset.path)
            uid = str(uid_val) if uid_val is not None else ""
        else:
            uid = ""

        mappings.append(PresetMapping(pc=pc, name=name, uid=uid))

    return mappings


def auto_map_and_install(plugin_name: str, preset_names: List[str], filename: str = "", channel: int = 0) -> dict:
    """
    One-click: scan presets → compute hashCode64 UIDs → generate XML → install to system dir.
    This is the recommended way to create a working MIDI mapping.
    """
    mappings = auto_map_with_uids(plugin_name, preset_names)
    xml_content, resolved_filename = generate_xml(plugin_name, mappings, filename)
    install_path = save_mapping(plugin_name, xml_content, resolved_filename)
    return {
        "success": True,
        "installed_path": install_path,
        "xml": xml_content,
        "filename": resolved_filename,
        "mapping_count": len(mappings),
        "mappings": [m.model_dump() for m in mappings],
    }


# ── Mapping file management ──────────────────────────────────────────────────

def list_mappings(plugin_name: Optional[str] = None) -> List[MappingFileInfo]:
    """List installed mapping files from Application Support directory."""
    results = []

    if plugin_name:
        plugin_dirs = [NEURAL_DSP_USER_CONFIG / plugin_name]
    else:
        if NEURAL_DSP_USER_CONFIG.exists():
            plugin_dirs = [d for d in NEURAL_DSP_USER_CONFIG.iterdir() if d.is_dir()]
        else:
            plugin_dirs = []

    for pdir in plugin_dirs:
        for subdir in ["MIDI Mappings", "MIDI"]:
            config_dir = pdir / subdir
            if not config_dir.is_dir():
                continue
            for fname in os.listdir(config_dir):
                if not fname.lower().endswith(".xml"):
                    continue
                fpath = config_dir / fname
                try:
                    content = fpath.read_text(encoding="utf-8")
                    tone_count = len(re.findall(r'<routing\s', content))
                    results.append(MappingFileInfo(
                        filename=fname,
                        plugin_name=pdir.name,
                        tone_count=tone_count,
                        path=str(fpath),
                    ))
                except Exception:
                    continue
    return results


def get_mapping_tones(plugin_name: str, filename: str) -> List[MappingTone]:
    """Parse tones from an installed mapping file, with UID → preset name resolution."""
    plugin_config_dir = NEURAL_DSP_USER_CONFIG / plugin_name
    xml_content = None

    for subdir in ["MIDI Mappings", "MIDI"]:
        fpath = plugin_config_dir / subdir / filename
        if fpath.is_file():
            xml_content = fpath.read_text(encoding="utf-8")
            break

    # Fallback to local backup
    if xml_content is None:
        backup = MAPPING_DIR / plugin_name / filename
        if backup.exists():
            xml_content = backup.read_text(encoding="utf-8")

    if xml_content is None:
        return []

    # Parse XML → raw uid/pc pairs
    raw_tones = []
    for match in re.finditer(r'<routing\s+([^>]+)/>', xml_content, re.DOTALL):
        attrs = match.group(1)
        # New format
        preset_m = re.search(r'preset="([^"]+)"', attrs)
        program_m = re.search(r'program="(\d+)"', attrs)
        if preset_m and program_m:
            raw_tones.append({"pc": int(program_m.group(1)), "uid": preset_m.group(1)})
            continue
        # Old format
        target_m = re.search(r'target="([^"]+)"', attrs)
        data1_m = re.search(r'data1="(\d+)"', attrs)
        if target_m and data1_m:
            raw_tones.append({"pc": int(data1_m.group(1)), "uid": target_m.group(1)})

    if not raw_tones:
        return []

    # Reverse-lookup: UID → preset name via scanning plugin presets
    uid_to_name = {}
    try:
        from .preset_scanner import scan_presets
        from .preset_uid import compute_preset_id_from_file
        all_presets = scan_presets(plugin_name)
        for p in all_presets:
            if p.uid:
                uid_to_name[p.uid] = p.name
            if p.path:
                computed_uid = compute_preset_id_from_file(p.path)
                if computed_uid is not None:
                    uid_to_name[str(computed_uid)] = p.name
    except Exception:
        pass

    # Build final tone list with resolved names
    tones = []
    for t in raw_tones:
        name = uid_to_name.get(t["uid"], f"Preset PC{t['pc']}")
        tones.append(MappingTone(pc=t["pc"], name=name, uid=t["uid"]))

    tones.sort(key=lambda x: x.pc)
    return tones


def delete_mapping(plugin_name: str, filename: str) -> bool:
    """Delete a mapping file from both installed location and backup."""
    deleted = False

    # Delete from Application Support
    plugin_config_dir = NEURAL_DSP_USER_CONFIG / plugin_name
    for subdir in ["MIDI Mappings", "MIDI"]:
        fpath = plugin_config_dir / subdir / filename
        if fpath.exists():
            fpath.unlink()
            deleted = True

    # Delete backup
    backup = MAPPING_DIR / plugin_name / filename
    if backup.exists():
        backup.unlink()
        deleted = True

    return deleted


def list_installed_mappings(plugin_name: str) -> List[dict]:
    """List installed mapping files for a plugin with parsed tone data."""
    return [m.model_dump() for m in list_mappings(plugin_name)]
