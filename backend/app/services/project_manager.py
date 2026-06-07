"""Project persistence — JSON file CRUD in data/projects/."""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from ..config import PROJECTS_DIR


def _project_path(project_id: str) -> Path:
    return PROJECTS_DIR / f"{project_id}.json"


def create_project(name: str, audio=None, device=None) -> dict:
    """Create a new project, return full project dict."""
    now = datetime.now(timezone.utc).isoformat()
    project = {
        "id": uuid.uuid4().hex,
        "name": name,
        "created_at": now,
        "updated_at": now,
        "audio": audio or {},
        "device": device or {},
        "triggers": [],
        "loop": {"enabled": False, "start_ms": None, "end_ms": None},
    }
    _write(project)
    return project


def list_projects() -> list[dict]:
    """List all projects, sorted by updated_at desc, return summaries."""
    result = []
    if not PROJECTS_DIR.exists():
        return result
    for f in sorted(PROJECTS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            p = json.loads(f.read_text())
            result.append({
                "id": p["id"],
                "name": p["name"],
                "created_at": p.get("created_at", ""),
                "updated_at": p.get("updated_at", ""),
                "audio_name": (p.get("audio") or {}).get("filename", ""),
                "trigger_count": len(p.get("triggers", [])),
                "plugin": (p.get("device") or {}).get("plugin", ""),
            })
        except Exception:
            continue
    return result


def get_project(project_id: str) -> dict | None:
    """Read and return full project data."""
    path = _project_path(project_id)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def update_project(project_id: str, updates: dict) -> dict | None:
    """Merge updates into existing project."""
    project = get_project(project_id)
    if project is None:
        return None
    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    for key in ("name", "audio", "device", "triggers", "loop"):
        if key in updates:
            project[key] = updates[key]
    # Frontend may send `audio_path` directly — store it inside audio dict
    if "audio_path" in updates:
        if not project.get("audio"):
            project["audio"] = {}
        project["audio"]["path"] = updates["audio_path"]
    _write(project)
    return project


def delete_project(project_id: str) -> bool:
    """Delete project file."""
    path = _project_path(project_id)
    if path.exists():
        path.unlink()
        return True
    return False


def duplicate_project(project_id: str, new_name=None) -> dict | None:
    """Duplicate a project with new UUID and optional name."""
    project = get_project(project_id)
    if project is None:
        return None
    project["id"] = uuid.uuid4().hex
    if new_name:
        project["name"] = new_name
    project["created_at"] = datetime.now(timezone.utc).isoformat()
    project["updated_at"] = project["created_at"]
    _write(project)
    return project


def _write(project: dict):
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    _project_path(project["id"]).write_text(json.dumps(project, indent=2, default=str))
