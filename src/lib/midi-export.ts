// ----- Internal helpers -----

function writeInt16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function writeInt32(value: number): number[] {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

function writeVarLen(value: number): number[] {
  if (value === 0) return [0];
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0x7f);
    v >>= 7;
  }
  for (let i = 0; i < bytes.length - 1; i++) {
    bytes[i] |= 0x80;
  }
  return bytes;
}

function stringToBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }
  return bytes;
}

function metaEvent(type: number, data: number[]): number[] {
  const len = writeVarLen(data.length);
  return [0xff, type, ...len, ...data];
}

function trackNameEvent(name: string): number[] {
  return metaEvent(0x03, stringToBytes(name));
}

function tempoEvent(bpm: number): number[] {
  const microPerBeat = Math.round(60_000_000 / bpm);
  return metaEvent(0x51, [
    (microPerBeat >> 16) & 0xff,
    (microPerBeat >> 8) & 0xff,
    microPerBeat & 0xff,
  ]);
}

function endOfTrackEvent(): number[] {
  return [0xff, 0x2f, 0x00];
}

function programChangeEvent(channel: number, program: number): number[] {
  return [0xc0 | (channel & 0x0f), program & 0x7f];
}

// ----- Exported types -----

export interface MidiTrigger {
  id: string;
  time: number;
  toneName: string;
  program: number;
  bank?: number;
}

export interface MidiMetadata {
  name: string;
  duration: number;
  bpm?: number;
}

// ----- Constants -----

const TICKS_PER_BEAT = 480;

// ----- Export -----

export function generateMidiFile(
  triggers: MidiTrigger[],
  metadata: MidiMetadata
): Uint8Array {
  const bpm = metadata.bpm ?? 120;
  const channel = 0;

  const sorted = [...triggers].sort((a, b) => a.time - b.time);

  const trackData: number[] = [];

  // delta 0 -> Track Name
  trackData.push(0x00, ...trackNameEvent(metadata.name));
  // delta 0 -> Tempo
  trackData.push(0x00, ...tempoEvent(bpm));

  let prevTimeSec = 0;

  for (const trigger of sorted) {
    const timeSec = trigger.time;
    const tickDelta = Math.round((timeSec - prevTimeSec) * (bpm / 60) * TICKS_PER_BEAT);
    const deltaBytes = writeVarLen(Math.max(0, tickDelta));
    prevTimeSec = timeSec;

    if (trigger.bank !== undefined) {
      // Bank Select MSB (CC#0)
      trackData.push(...deltaBytes, 0xb0 | channel, 0x00, trigger.bank & 0x7f);
      // Bank Select LSB (CC#32)
      trackData.push(0x00, 0xb0 | channel, 0x20, 0x00);
      // Program Change
      trackData.push(0x00, ...programChangeEvent(channel, trigger.program));
    } else {
      trackData.push(...deltaBytes, ...programChangeEvent(channel, trigger.program));
    }
  }

  // End of Track (delta 0)
  trackData.push(0x00, ...endOfTrackEvent());

  const header: number[] = [];
  // "MThd"
  header.push(...stringToBytes("MThd"));
  // chunk size = 6
  header.push(...writeInt32(6));
  // format 0
  header.push(...writeInt16(0));
  // 1 track
  header.push(...writeInt16(1));
  // ticks per beat
  header.push(...writeInt16(TICKS_PER_BEAT));

  // "MTrk"
  const trackHeader: number[] = [];
  trackHeader.push(...stringToBytes("MTrk"));
  trackHeader.push(...writeInt32(trackData.length));

  const file = new Uint8Array(header.length + trackHeader.length + trackData.length);
  file.set(new Uint8Array([...header, ...trackHeader, ...trackData]));
  return file;
}

export function downloadMidiFile(
  triggers: MidiTrigger[],
  metadata: MidiMetadata
): void {
  if (typeof window === "undefined") return;

  const bytes = generateMidiFile(triggers, metadata);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  const safeName = metadata.name.replace(/[^a-zA-Z0-9]/g, "_");
  a.download = `${safeName}.mid`;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
