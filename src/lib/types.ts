export interface MidiPort {
  name: string;
  id: string;
}

export interface WaveformData {
  peaks: number[];
  duration_ms: number;
}

export interface WSPlaybackCommand {
  type: "playback_command";
  command: "play" | "pause" | "stop" | "seek";
  position_ms?: number;
}

export interface WSLoadAudio {
  type: "load_audio";
  path: string;
}

export interface WSPlaybackState {
  type: "playback_state";
  state: "playing" | "paused" | "stopped";
  position_ms: number;
}
