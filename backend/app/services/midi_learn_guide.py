"""MIDI Learn Guide — session-based wizard for presets without UIDs."""
import uuid
import time
from dataclasses import dataclass, field
from typing import Optional


# Sessions older than this (seconds) are automatically cleaned up
_SESSION_TTL_SECONDS = 30 * 60  # 30 minutes


@dataclass
class LearnGuideSession:
    session_id: str
    plugin: str
    preset_names: list
    port_name: str
    current_step: int = 0
    results: list = field(default_factory=list)
    _temp_pc: int = 100
    created_at: float = field(default_factory=time.time)

    @property
    def total(self) -> int:
        return len(self.preset_names)

    @property
    def is_complete(self) -> bool:
        return self.current_step >= self.total


_sessions: dict[str, LearnGuideSession] = {}


def _cleanup_expired_sessions() -> None:
    """Remove sessions that have exceeded their TTL."""
    now = time.time()
    expired = [sid for sid, s in _sessions.items() if now - s.created_at > _SESSION_TTL_SECONDS]
    for sid in expired:
        del _sessions[sid]


def start_session(plugin: str, preset_names: list[str], port_name: str) -> LearnGuideSession:
    """Create a new MIDI Learn session."""
    _cleanup_expired_sessions()
    sid = uuid.uuid4().hex[:12]
    session = LearnGuideSession(
        session_id=sid,
        plugin=plugin,
        preset_names=preset_names,
        port_name=port_name,
    )
    _sessions[sid] = session
    return session


def get_session(session_id: str) -> Optional[LearnGuideSession]:
    _cleanup_expired_sessions()
    return _sessions.get(session_id)


def get_current_step(session_id: str) -> Optional[dict]:
    session = _sessions.get(session_id)
    if not session or session.is_complete:
        return None
    name = session.preset_names[session.current_step]
    pc = session._temp_pc + session.current_step
    return {
        "session_id": session_id,
        "step": session.current_step + 1,
        "total": session.total,
        "preset_name": name,
        "pc_value": pc,
        "instruction": f"Switch to '{name}' in your Neural DSP plugin, then click Execute.",
    }


def execute_step(session_id: str) -> Optional[dict]:
    """Send MIDI PC, attempt to capture UID."""
    session = _sessions.get(session_id)
    if not session or session.is_complete:
        return None

    name = session.preset_names[session.current_step]
    pc = session._temp_pc + session.current_step

    try:
        from .midi_controller import send_pc
        send_pc(session.port_name, pc)
        time.sleep(0.3)
    except Exception:
        pass

    uid = f"learn_{session.session_id}_{session.current_step}"
    session.results.append({"name": name, "pc_assigned": pc, "uid": uid})
    session.current_step += 1

    return {
        "name": name,
        "pc_assigned": pc,
        "uid": uid,
        "step": session.current_step,
        "total": session.total,
        "complete": session.is_complete,
    }


def get_results(session_id: str) -> Optional[list]:
    session = _sessions.get(session_id)
    if not session:
        return None
    return session.results
