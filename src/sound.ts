export async function playPingSound() {
  try {
    const context = new AudioContext();
    await context.resume();
    const start = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    gain.connect(context.destination);
    for (const [frequency, offset] of [[880, 0], [1320, 0.11]] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      oscillator.connect(gain);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.3);
    }
    window.setTimeout(() => void context.close(), 500);
  } catch { /* Notifications still work when audio is unavailable or blocked. */ }
}
