"""
Guitar AutoStomp Backend — stdio JSON-RPC mode.

Communication protocol:
  - Reads JSON lines from stdin (one JSON object per line)
  - Writes JSON lines to stdout (one JSON object per line)
  - Each request has: {"id": "...", "method": "...", "params": {...}}
  - Each response has: {"id": "...", "result": {...}} or {"id": "...", "error": "..."}
  - Notifications (no response expected): {"method": "...", "params": {...}} (no "id")

This replaces the FastAPI/uvicorn HTTP+WebSocket server entirely.
No TCP ports are used. The process lifetime is managed by Electron.
"""
import sys
import json
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Patch pydub for Python 3.13+
import patch_audioop  # noqa: F401

from app.config import PROJECTS_DIR, AUDIO_SUPPORTED_FORMATS, AUDIO_MAX_SIZE_MB, MAPPING_DIR
from app.services.audio_engine import AudioEngine
from app.services.project_manager import (
    create_project, list_projects, get_project, update_project, delete_project, duplicate_project,
)
from app.services.preset_scanner import scan_plugins, scan_presets
from app.services.midi_xml_gen import (
    generate_xml, save_mapping, list_mappings, get_mapping_tones, delete_mapping,
    auto_map, auto_map_with_uids, auto_map_and_install,
)
from app.services.midi_learn_guide import start_session, get_current_step, execute_step, get_results
from app.models import AutoMapRequest, GenerateXmlRequest, InstallXmlRequest, MidiTestRequest

# ─── Global state ───
audio = AudioEngine()
_midi_port_name: str | None = None
_thread_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="rpc-worker")

# Methods that may block for a long time and should be offloaded to the thread pool
_ASYNC_METHODS = {"audio.waveform", "audio.upload"}

# ─── Path safety ───
_USER_HOME = Path.home()

def _validate_audio_path(path_str: str) -> Path:
    """Resolve an audio file path and ensure it's within the user's home directory (prevents directory traversal)."""
    if not path_str:
        raise ValueError("Missing file path")
    resolved = Path(path_str).resolve()
    # Security: only allow paths under user home or PROJECTS_DIR
    if not (str(resolved).startswith(str(_USER_HOME)) or str(resolved).startswith(str(PROJECTS_DIR))):
        raise PermissionError(f"Access denied: path is outside allowed directories")
    return resolved

# ─── stdout lock (prevent interleaving from multiple threads) ───
_stdout_lock = threading.Lock()


def send_response(req_id: str | None, result=None, error=None, error_code: str = "internal_error"):
    """Send a JSON-RPC response to stdout.

    Errors are returned in a standardized structured form:
        {"id": ..., "error": {"code": "<code>", "message": "<text>"}}
    """
    if req_id is None:
        return  # Notification, no response needed
    msg = {"id": req_id}
    if error is not None:
        msg["error"] = {"code": error_code, "message": str(error)}
    else:
        msg["result"] = result
    line = json.dumps(msg, default=str, ensure_ascii=False)
    with _stdout_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


# Map common exception types to stable error codes
_ERROR_CODE_MAP = {
    "FileNotFoundError": "not_found",
    "PermissionError": "permission_denied",
    "ValueError": "invalid_argument",
    "KeyError": "invalid_argument",
    "TimeoutError": "timeout",
}


def _error_code_for(exc: Exception) -> str:
    return _ERROR_CODE_MAP.get(type(exc).__name__, "internal_error")


def send_event(event_type: str, data: dict):
    """Send an unsolicited event (notification) to stdout."""
    msg = {"event": event_type, **data}
    line = json.dumps(msg, default=str, ensure_ascii=False)
    with _stdout_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


# ─── Method handlers ───

def handle_health(params):
    return {"status": "ok", "version": "1.0.0"}


# ── Audio ──

def handle_audio_upload(params):
    file_path = params.get("path", "")
    filepath = _validate_audio_path(file_path)
    if not filepath.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    ext = filepath.suffix.lower()
    if ext not in AUDIO_SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported format: {ext}")
    size_mb = filepath.stat().st_size / (1024 * 1024)
    if size_mb > AUDIO_MAX_SIZE_MB:
        raise ValueError(f"File too large: {size_mb:.1f}MB (max {AUDIO_MAX_SIZE_MB}MB)")
    duration_sec = None
    try:
        import soundfile as sf
        info = sf.info(str(filepath))
        duration_sec = round(info.duration, 3)
    except Exception:
        pass
    return {"success": True, "filename": filepath.name, "path": str(filepath), "size_mb": round(size_mb, 2), "duration_sec": duration_sec}


def handle_audio_waveform(params):
    path = params.get("path", "")
    num_peaks = params.get("num_peaks", 800)
    resolved = _validate_audio_path(path)
    if not resolved.exists():
        raise FileNotFoundError("File not found")
    peaks, duration_ms = audio.get_waveform_peaks(str(resolved), num_peaks)
    return {"peaks": peaks, "num_peaks": len(peaks), "duration_ms": duration_ms}


def handle_audio_serve(params):
    """Return audio file as base64-encoded data for Web Audio API decoding."""
    import base64
    path = params.get("path", "")
    resolved = _validate_audio_path(path)
    if not resolved.exists():
        raise FileNotFoundError("File not found")
    data = resolved.read_bytes()
    return {"data": base64.b64encode(data).decode("ascii"), "size": len(data), "path": str(resolved)}


# ── Projects ──

def handle_projects_create(params):
    p = create_project(params.get("name", "Untitled"), params.get("audio"), params.get("device"))
    # After creation, apply additional fields the frontend may send (triggers, audio_path)
    updates = {}
    if "triggers" in params:
        updates["triggers"] = params["triggers"]
    if "audio_path" in params:
        updates["audio_path"] = params["audio_path"]
    if updates:
        p = update_project(p["id"], updates) or p
    return {"project": _enrich_project(p)}


def handle_projects_list(params):
    return {"projects": list_projects()}


def handle_projects_get(params):
    p = get_project(params["project_id"])
    if p is None:
        raise ValueError("Not found")
    return {"project": _enrich_project(p)}


def handle_projects_update(params):
    p = update_project(params["project_id"], params.get("data", {}))
    if p is None:
        raise ValueError("Not found")
    return {"project": _enrich_project(p)}


def handle_projects_delete(params):
    ok = delete_project(params["project_id"])
    return {"success": ok}


def handle_projects_duplicate(params):
    p = duplicate_project(params["project_id"], params.get("name"))
    if p is None:
        raise ValueError("Not found")
    return {"project": p}


def _enrich_project(p: dict) -> dict:
    enriched = dict(p)
    audio_info = p.get("audio") or {}
    if "audio_path" not in enriched:
        enriched["audio_path"] = audio_info.get("path") or audio_info.get("filename") or None
    enriched["trigger_count"] = len(p.get("triggers", []))
    return enriched


# ── Plugins & Presets ──

def handle_plugins_list(params):
    plugins = [p.model_dump() for p in scan_plugins()]
    try:
        from app.services.midi_controller import list_available_outputs
        midi_ports = list_available_outputs()
        plugin_names = {p["name"] for p in plugins}
        for port in midi_ports:
            if port == "AutoStomp Virtual":
                continue
            if port not in plugin_names:
                plugins.append({
                    "name": port,
                    "path": f"midi://{port}",
                    "preset_count": 128,
                    "has_mapping": False,
                    "is_hardware": True,
                })
    except Exception:
        pass
    return plugins


def handle_presets_list(params):
    plugin = params.get("plugin", "")
    source = params.get("source")
    presets = scan_presets(plugin)
    if source and source != "all":
        source_map = {'user': 'user', 'artists': 'artists', 'factory': 'factory'}
        target = source_map.get(source.lower(), source.lower())
        presets = [p for p in presets if p.source.lower().startswith(target)]
    return [p.model_dump() for p in presets]


# ── MIDI ──

def handle_midi_virtual_port_status(params):
    """Get virtual port status — Windows uses this to show loopMIDI guidance."""
    from app.services.midi_controller import get_virtual_port_status
    return get_virtual_port_status()


def handle_midi_ports(params):
    try:
        from app.services.midi_controller import list_available_outputs
        ports = list_available_outputs()
    except Exception:
        ports = []
    return {"ports": [{"index": i, "name": p} for i, p in enumerate(ports)]}


def handle_midi_connect(params):
    port_index = params.get("port_index", -1)
    try:
        from app.services.midi_controller import list_available_outputs
        ports = list_available_outputs()
        if 0 <= port_index < len(ports):
            global _midi_port_name
            _midi_port_name = ports[port_index]
            return {"name": _midi_port_name, "index": port_index}
    except Exception:
        pass
    raise ValueError("Failed to connect MIDI port")


def handle_midi_select_port(params):
    global _midi_port_name
    port_name = params.get("port_name", "")
    _midi_port_name = port_name if port_name else None
    return {"port_name": _midi_port_name or "AutoStomp Virtual (default)"}


def handle_midi_generate(params):
    plugin_name = params["plugin_name"]
    mappings_raw = params["mappings"]
    from app.models import PresetMapping
    mappings = [PresetMapping(**m) for m in mappings_raw]
    xml_content, filename = generate_xml(plugin_name, mappings, params.get("filename"))
    return {"xml_content": xml_content, "filename": filename, "mapping_count": len(mappings)}


def handle_midi_automap(params):
    plugin_name = params["plugin_name"]
    preset_names = params.get("preset_names")
    if not preset_names:
        user_presets = scan_presets(plugin_name, source="user")
        if not user_presets:
            raise ValueError("No user presets found for this plugin")
        preset_names = [p.name for p in user_presets]
    result = auto_map_and_install(plugin_name, preset_names, filename=params.get("filename", ""))
    return result


def handle_midi_install(params):
    path = save_mapping(params["plugin_name"], params["xml_content"], params["filename"])
    return {"installed_path": path, "success": True}


def handle_midi_test(params):
    from app.services.midi_controller import send_pc
    send_pc(params.get("port_name", _midi_port_name or ""), params["program"], params.get("channel", 0))
    return {"success": True}


def handle_midi_fire_trigger(params):
    """Execute a MIDI Program Change immediately — time-critical path."""
    from app.services.midi_controller import send_pc
    pc = params.get("pc", params.get("program", 0))
    channel = params.get("channel", 0)
    send_pc(_midi_port_name or "", int(pc), int(channel))
    # Return confirmation for UI feedback
    return {
        "fired": True,
        "id": params.get("id", ""),
        "pc": pc,
        "name": params.get("name", ""),
        "time_ms": params.get("time_ms", 0),
    }


def handle_midi_mappings_list(params):
    plugin = params.get("plugin")
    return [m.model_dump() for m in list_mappings(plugin)]


def handle_midi_mappings_tones(params):
    tones = get_mapping_tones(params["plugin"], params["filename"])
    if not tones:
        raise ValueError("Not found")
    return [t.model_dump() for t in tones]


def handle_midi_mappings_delete(params):
    ok = delete_mapping(params["plugin"], params["filename"])
    if not ok:
        raise ValueError("Not found")
    return {"success": True}


# ── MIDI Learn ──

def handle_midi_learn_start(params):
    sess = start_session(params.get("plugin", ""), params.get("preset_names", []), params.get("port_name", ""))
    return {"session_id": sess.session_id, "total": sess.total}


def handle_midi_learn_step(params):
    step = get_current_step(params["session_id"])
    if step is None:
        raise ValueError("Session not found")
    return step


def handle_midi_learn_execute(params):
    result = execute_step(params["session_id"])
    if result is None:
        raise ValueError("Session not found")
    return result


def handle_midi_learn_results(params):
    results = get_results(params["session_id"])
    if results is None:
        raise ValueError("Session not found")
    return {"results": results}


# ── Init / Auto-Setup ──

def handle_init_auto_setup(params):
    try:
        plugins = scan_plugins()
        if not plugins:
            return {"status": "no_plugins", "plugin": None, "user_presets": [], "mapping_installed": False}
        plugin = max(plugins, key=lambda p: p.preset_count)
        plugin_name = plugin.name
        existing = list_mappings(plugin_name)
        if existing:
            tones = get_mapping_tones(plugin_name, existing[0].filename)
            return {
                "status": "ready",
                "plugin": plugin_name,
                "mapping_file": existing[0].filename,
                "user_presets": [t.model_dump() for t in tones],
                "mapping_installed": True,
            }
        user_presets = scan_presets(plugin_name, source="user")
        if not user_presets:
            return {"status": "no_user_presets", "plugin": plugin_name, "user_presets": [], "mapping_installed": False}
        preset_names = [p.name for p in user_presets]
        result = auto_map_and_install(plugin_name, preset_names, filename="")
        mapping_file = result.get("filename", "")
        return {
            "status": "auto_mapped",
            "plugin": plugin_name,
            "user_presets": [{"name": p.name, "pc": i, "uid": p.uid or ""} for i, p in enumerate(user_presets)],
            "mapping_installed": True,
            "mapping_file": mapping_file,
            "installed_path": result.get("installed_path", ""),
        }
    except Exception as e:
        raise ValueError(str(e))


# ─── Method dispatch table ───

METHODS = {
    "health": handle_health,
    # Audio
    "audio.upload": handle_audio_upload,
    "audio.waveform": handle_audio_waveform,
    "audio.serve": handle_audio_serve,
    # Projects
    "projects.create": handle_projects_create,
    "projects.list": handle_projects_list,
    "projects.get": handle_projects_get,
    "projects.update": handle_projects_update,
    "projects.delete": handle_projects_delete,
    "projects.duplicate": handle_projects_duplicate,
    # Plugins & Presets
    "plugins.list": handle_plugins_list,
    "presets.list": handle_presets_list,
    # MIDI
    "midi.virtual_port_status": handle_midi_virtual_port_status,
    "midi.ports": handle_midi_ports,
    "midi.connect": handle_midi_connect,
    "midi.select_port": handle_midi_select_port,
    "midi.generate": handle_midi_generate,
    "midi.automap": handle_midi_automap,
    "midi.install": handle_midi_install,
    "midi.test": handle_midi_test,
    "midi.fire_trigger": handle_midi_fire_trigger,
    "midi.mappings.list": handle_midi_mappings_list,
    "midi.mappings.tones": handle_midi_mappings_tones,
    "midi.mappings.delete": handle_midi_mappings_delete,
    # MIDI Learn
    "midi.learn.start": handle_midi_learn_start,
    "midi.learn.step": handle_midi_learn_step,
    "midi.learn.execute": handle_midi_learn_execute,
    "midi.learn.results": handle_midi_learn_results,
    # Init
    "init.auto_setup": handle_init_auto_setup,
}


def _run_handler(req_id, handler, params):
    """Execute a handler and send the response. Used both inline and in the thread pool."""
    try:
        result = handler(params)
        send_response(req_id, result=result)
    except Exception as e:
        send_response(req_id, error=str(e), error_code=_error_code_for(e))


def dispatch(request: dict):
    """Dispatch a JSON-RPC request to the appropriate handler."""
    req_id = request.get("id")
    method = request.get("method", "")
    params = request.get("params", {})

    handler = METHODS.get(method)
    if handler is None:
        send_response(req_id, error=f"Unknown method: {method}", error_code="method_not_found")
        return

    # Offload heavy/blocking methods to thread pool so the main loop stays responsive
    if method in _ASYNC_METHODS:
        _thread_pool.submit(_run_handler, req_id, handler, params)
    else:
        _run_handler(req_id, handler, params)


# ─── Main loop ───

def main():
    # Initialize MIDI virtual port
    from app.services.midi_controller import init_virtual_port, cleanup as midi_cleanup
    init_virtual_port()

    # Send ready signal
    send_event("ready", {"version": "1.0.0"})

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
            except json.JSONDecodeError as e:
                # Write error for malformed JSON
                send_response(None, error=f"Invalid JSON: {e}")
                continue
            # Dispatch in current thread (requests are serialized anyway since stdin is sequential)
            # For fire_trigger we want minimum latency, so no threading overhead.
            dispatch(request)
    except (EOFError, KeyboardInterrupt):
        pass
    finally:
        midi_cleanup()


if __name__ == "__main__":
    main()
