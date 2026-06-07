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

// Note: MIDI message sending (PC/CC) is handled exclusively by the Python backend
// via stdio JSON-RPC. The Web MIDI API here is only used for port enumeration/display.

export function onPortChange(
  fn: (ports: MidiPortInfo[]) => void
): () => void {
  portChangeListeners.add(fn);
  return () => {
    portChangeListeners.delete(fn);
  };
}