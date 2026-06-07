export interface MidiPortInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: "connected" | "disconnected";
}

let midiAccess: MIDIAccess | null = null;
let currentOutput: MIDIOutput | null = null;
const portChangeListeners = new Set<(ports: MidiPortInfo[]) => void>();

export function isMidiSupported(): boolean {
  return (
    typeof navigator !== "undefined" && "requestMIDIAccess" in navigator
  );
}

export async function initMidi(): Promise<boolean> {
  if (!isMidiSupported()) return false;

  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });

    midiAccess.onstatechange = () => {
      // Clear currentOutput if the selected port was disconnected
      if (currentOutput && currentOutput.state === 'disconnected') {
        currentOutput = null;
      }
      const ports = getOutputPorts();
      portChangeListeners.forEach((fn) => fn(ports));
    };

    return true;
  } catch (err) {
    console.error("[MIDI] Init failed:", err);
    return false;
  }
}

export function getOutputPorts(): MidiPortInfo[] {
  if (!midiAccess) return [];
  const ports: MidiPortInfo[] = [];
  midiAccess.outputs.forEach((port) => {
    ports.push({
      id: port.id,
      name: port.name ?? "Unknown",
      manufacturer: port.manufacturer ?? "Unknown",
      state: port.state === "connected" ? "connected" : "disconnected",
    });
  });
  return ports;
}

export function selectPort(portId: string): boolean {
  if (!midiAccess) return false;
  const port = midiAccess.outputs.get(portId);
  if (!port) return false;
  currentOutput = port;
  return true;
}

export function getCurrentPortId(): string | null {
  return currentOutput?.id ?? null;
}

export function sendProgramChange(
  program: number,
  channel: number = 0
): boolean {
  if (!currentOutput) {
    console.warn("[MIDI] No output port selected");
    return false;
  }
  try {
    const statusByte = 0xc0 | (channel & 0x0f);
    const programByte = program & 0x7f;
    currentOutput.send([statusByte, programByte]);
    console.log(
      `[MIDI] Sent PC: program=${program}, channel=${channel}`
    );
    return true;
  } catch (err) {
    console.error("[MIDI] Send PC failed:", err);
    return false;
  }
}

export function sendControlChange(
  controller: number,
  value: number,
  channel: number = 0
): boolean {
  if (!currentOutput) {
    console.warn("[MIDI] No output port selected");
    return false;
  }
  try {
    const statusByte = 0xb0 | (channel & 0x0f);
    currentOutput.send([statusByte, controller & 0x7f, value & 0x7f]);
    return true;
  } catch (err) {
    console.error("[MIDI] Send CC failed:", err);
    return false;
  }
}

export function onPortChange(
  fn: (ports: MidiPortInfo[]) => void
): () => void {
  portChangeListeners.add(fn);
  return () => {
    portChangeListeners.delete(fn);
  };
}

export function detectOS(): "mac" | "windows" | "linux" | "unknown" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}
