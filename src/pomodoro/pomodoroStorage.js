const STORAGE_KEY = "disc.pomodoroSettings";

export const DEFAULT_POMODORO_SETTINGS = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4, // take a long break after this many work sessions
  soundEnabled: true,
};

export function loadPomodoroSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_POMODORO_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_POMODORO_SETTINGS };
  }
}

export function savePomodoroSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
