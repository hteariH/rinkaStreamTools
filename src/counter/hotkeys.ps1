param(
  [string]$Bindings = "",
  [int]$IntervalMs = 30,
  [int]$ParentPid = 0
)

# Горячие клавиши счётчика. Скрипт печатает имя действия («plus», «minus»,
# «reset») в тот момент, когда клавишу нажали, — сервер читает строки.
#
# Клавиатура опрашивается, а не перехватывается: GetAsyncKeyState только
# спрашивает у системы, нажата ли клавиша сейчас. Поэтому хоткей работает, когда
# в фокусе игра, и при этом сама игра нажатие тоже получает — счётчик не
# отбирает клавишу у того, ради чего её жмут.
#
# Строка привязок: «действие,код,ctrl,alt,shift», записи через «;».

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -Namespace Rinka -Name Keyboard -MemberDefinition @"
[DllImport("user32.dll")]
public static extern short GetAsyncKeyState(int vKey);
"@

# Старший бит — «клавиша нажата прямо сейчас». Младший («нажимали с прошлого
# опроса») намеренно не трогаем: он общий на всех, кто спрашивает, и вычитается
# первым же читателем.
function Test-Down([int]$code) {
  return ([Rinka.Keyboard]::GetAsyncKeyState($code) -band 0x8000) -ne 0
}

$list = @()
foreach ($entry in $Bindings -split ";") {
  $parts = $entry -split ","
  if ($parts.Count -ne 5) { continue }
  $list += [pscustomobject]@{
    Action = $parts[0]
    Code   = [int]$parts[1]
    Ctrl   = $parts[2] -eq "1"
    Alt    = $parts[3] -eq "1"
    Shift  = $parts[4] -eq "1"
  }
}

if ($list.Count -eq 0) {
  Write-Error "нет ни одной привязки"
  exit 1
}

# Что было нажато на прошлом опросе. Заполняем до цикла: клавишу могли держать в
# момент запуска, и считать это нажатием нельзя.
$down = @{}
for ($i = 0; $i -lt $list.Count; $i++) { $down[$i] = Test-Down $list[$i].Code }

while ($true) {
  # Сервер мог упасть, не убив нас за собой: без этой проверки опрос остался бы
  # висеть до перезагрузки.
  if ($ParentPid -gt 0) {
    if ($null -eq (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit 0 }
  }

  $ctrl  = (Test-Down 0x11)
  $alt   = (Test-Down 0x12)
  $shift = (Test-Down 0x10)

  for ($i = 0; $i -lt $list.Count; $i++) {
    $binding = $list[$i]
    $isDown = Test-Down $binding.Code
    $was = $down[$i]
    $down[$i] = $isDown
    if (-not $isDown -or $was) { continue }

    # Модификаторы сверяются точно, а не «хотя бы»: иначе Ctrl+F8 срабатывал бы
    # и на голую F8, и развести два действия по одной клавише было бы нельзя.
    if ($ctrl -ne $binding.Ctrl -or $alt -ne $binding.Alt -or $shift -ne $binding.Shift) { continue }

    Write-Output $binding.Action
    [Console]::Out.Flush()
  }

  Start-Sleep -Milliseconds $IntervalMs
}
