from pydantic import BaseModel
from typing import Optional, List


class MidiPortInfo(BaseModel):
    name: str
    index: int
    is_virtual: bool = False


class PresetInfo(BaseModel):
    name: str
    uid: Optional[str] = None
    path: Optional[str] = None
    source: str = "filesystem"  # "filesystem" | "user" | "factory"


class PresetMapping(BaseModel):
    pc: int  # Program Change number (0-127)
    name: str
    uid: Optional[str] = None
    color: Optional[str] = None


class PluginInfo(BaseModel):
    name: str
    path: str
    preset_count: int
    has_mapping: bool = False


class GenerateXmlRequest(BaseModel):
    plugin_name: str
    mappings: List[PresetMapping]
    filename: Optional[str] = None


class GenerateXmlResponse(BaseModel):
    xml_content: str
    filename: str
    mapping_count: int


class AutoMapRequest(BaseModel):
    plugin_name: str
    preset_names: Optional[List[str]] = None  # If empty/None, auto-scan all user presets
    start_pc: int = 0
    filename: Optional[str] = None  # Custom XML filename (e.g. "my-tones.xml")


class AutoMapResponse(BaseModel):
    mappings: List[PresetMapping]
    xml_content: str
    filename: str


class InstallXmlRequest(BaseModel):
    plugin_name: str
    xml_content: str
    filename: str


class InstallXmlResponse(BaseModel):
    installed_path: str
    success: bool


class MidiTestRequest(BaseModel):
    port_name: str
    program: int
    channel: int = 0
    bank_msb: Optional[int] = None
    bank_lsb: Optional[int] = None


class MidiTestResponse(BaseModel):
    success: bool
    message: str


class MappingFileInfo(BaseModel):
    filename: str
    plugin_name: str
    tone_count: int
    path: str


class MappingTone(BaseModel):
    pc: int
    name: str
    uid: Optional[str] = None


class TransportCommand(BaseModel):
    command: str  # "play" | "pause" | "stop" | "seek"
    position_ms: Optional[int] = None
