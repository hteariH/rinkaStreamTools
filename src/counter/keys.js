// Разбор горячей клавиши: «Ctrl+Shift+F8» → код клавиши, который понимает
// Windows.
//
// Имена клавиш взяты у браузера (KeyboardEvent.code): панель записывает хоткей,
// поймав нажатие в поле, и отдаёт сюда ровно то, что назвал браузер. Свой формат
// был бы третьим переводом между панелью, конфигом и скриптом опроса.
//
// Кодов ровно столько, сколько клавиш имеет смысл вешать на счётчик: буквы,
// цифры, F1–F24, нампад, стрелки и блок навигации. Модификаторы сами по себе
// хоткеем не бывают — они только приставка.

// Виртуальные коды Windows для клавиш, у которых нет правила.
const NAMED = {
  Escape: 0x1b,
  Tab: 0x09,
  Space: 0x20,
  Enter: 0x0d,
  Backspace: 0x08,
  Insert: 0x2d,
  Delete: 0x2e,
  Home: 0x24,
  End: 0x23,
  PageUp: 0x21,
  PageDown: 0x22,
  ArrowLeft: 0x25,
  ArrowUp: 0x26,
  ArrowRight: 0x27,
  ArrowDown: 0x28,
  NumpadMultiply: 0x6a,
  NumpadAdd: 0x6b,
  NumpadSubtract: 0x6d,
  NumpadDecimal: 0x6e,
  NumpadDivide: 0x6f,
  // Enter на нампаде системе неотличим от обычного: опрос видит один и тот же
  // код, и разводить их было бы обманом — сработают оба.
  NumpadEnter: 0x0d,
};

/** Код клавиши по её имени из браузера или null, если такую не вешаем. */
export function keyCode(name) {
  const key = String(name ?? "").trim();
  if (!key) return null;
  if (NAMED[key] !== undefined) return NAMED[key];

  let match = /^Key([A-Z])$/.exec(key);
  if (match) return match[1].charCodeAt(0);

  match = /^Digit([0-9])$/.exec(key);
  if (match) return 0x30 + Number(match[1]);

  match = /^Numpad([0-9])$/.exec(key);
  if (match) return 0x60 + Number(match[1]);

  match = /^F([1-9]|1[0-9]|2[0-4])$/.exec(key);
  if (match) return 0x6f + Number(match[1]);

  return null;
}

/**
 * «Ctrl+F8» → { code, ctrl, alt, shift }. null — клавиши нет или её не вешаем.
 * Порядок приставок не важен, регистр тоже: конфиг правят и руками.
 */
export function parseHotkey(hotkey) {
  const parts = String(hotkey ?? "").split("+").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  const binding = { code: 0, ctrl: false, alt: false, shift: false };
  const key = parts.pop();

  for (const part of parts) {
    switch (part.toLowerCase()) {
      case "ctrl": case "control": binding.ctrl = true; break;
      case "alt": binding.alt = true; break;
      case "shift": binding.shift = true; break;
      default: return null;
    }
  }

  const code = keyCode(key);
  if (code === null) return null;
  binding.code = code;
  return binding;
}
