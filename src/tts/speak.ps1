param(
  # Без -List скрипт озвучивает, с -List только перечисляет голоса.
  [switch]$List,
  [string]$TextFile = "",
  [string]$Out = "",
  [string]$Voice = "",
  [int]$Rate = 0
)

# Офлайновая озвучка голосами Windows. Сервер вызывает этот скрипт, забирает
# готовый wav и отдаёт его оверлею — как и в случае с облачным движком, страница
# получает просто ссылку на звук.
#
# Текст приходит файлом, а не аргументом: сообщение зрителя — чужой ввод, и
# кавычки, переносы и ведущий дефис в нём не должны превращаться в параметры
# команды.

$ErrorActionPreference = "Stop"

# Имена голосов и сам текст бывают кириллицей — без этого консоль отдаёт мусор.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

if ($List) {
  # Имя переменной цикла нарочно не $voice: параметр $Voice объявлен строкой, а
  # переменные в PowerShell не различают регистр — объект голоса молча привёлся бы
  # к строке, и список оказывался бы пустым без единой ошибки.
  foreach ($installed in $synth.GetInstalledVoices()) {
    # Выключенные голоса пропускаем: выбрать их всё равно нельзя.
    if (-not $installed.Enabled) { continue }
    $info = $installed.VoiceInfo
    Write-Output ("{0}`t{1}" -f $info.Name, $info.Culture)
  }
  $synth.Dispose()
  exit 0
}

$text = Get-Content -LiteralPath $TextFile -Raw -Encoding UTF8
if (-not $text) {
  $synth.Dispose()
  exit 2
}

# Голос задан именем, как его показывает система. Не нашёлся — читаем голосом по
# умолчанию: молчать из-за переименованного голоса хуже, чем прочитать не тем.
if ($Voice) {
  try { $synth.SelectVoice($Voice) } catch { }
}

$synth.Rate = $Rate
$synth.SetOutputToWaveFile($Out)
$synth.Speak($text)
$synth.Dispose()
