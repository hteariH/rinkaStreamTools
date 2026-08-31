param(
  [string]$AppFilter = "",
  [int]$IntervalMs = 1500,
  [int]$ParentPid = 0
)

# Медиасессия Windows (SMTC) — то же, что показывает всплывашка громкости:
# Spotify, AIMP, foobar, ролик во вкладке браузера. Скрипт печатает по строке
# JSON на опрос, сервер читает их построчно.

$ErrorActionPreference = "Stop"

# Названия бывают кириллицей, а консоль по умолчанию отдаёт их в кодировке
# системы — без этого сервер получил бы вопросительные знаки.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime

# WinRT-методы асинхронные, а PowerShell их не ждёт. Обёртка ниже — стандартный
# для 5.1 приём: найти AsTask через рефлексию и дождаться задачи.
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
})[0]

function Await($operation, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  # Таймаут, а не бесконечное ожидание: зависший плеер не должен вешать опрос.
  if (-not $task.Wait(4000)) { return $null }
  return $task.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]

$manager = Await ($managerType::RequestAsync()) ($managerType)
if ($null -eq $manager) {
  Write-Output '{"error":"медиасессия недоступна"}'
  exit 1
}

# Приложение выбирается по подстроке в id: у стримера в браузере может играть
# ролик, а в эфир нужен только плеер.
function Select-Session($sessions) {
  if ($AppFilter) {
    $matched = @($sessions | Where-Object { $_.SourceAppUserModelId -like "*$AppFilter*" })
    if ($matched.Count -eq 0) { return $null }
    # Играющая важнее просто открытой: плееров может быть открыто несколько.
    $playing = @($matched | Where-Object { "$($_.GetPlaybackInfo().PlaybackStatus)" -eq "Playing" })
    if ($playing.Count -gt 0) { return $playing[0] }
    return $matched[0]
  }

  # Без фильтра — та, что система считает текущей (её же показывает всплывашка).
  $current = $manager.GetCurrentSession()
  if ($null -ne $current) { return $current }
  return @($sessions | Where-Object { "$($_.GetPlaybackInfo().PlaybackStatus)" -eq "Playing" })[0]
}

while ($true) {
  # Сервер мог упасть, не убив нас за собой: без этой проверки опрос остался бы
  # висеть до перезагрузки.
  if ($ParentPid -gt 0) {
    if ($null -eq (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit 0 }
  }

  $payload = [ordered]@{ apps = @(); track = $null }

  try {
    $sessions = @($manager.GetSessions())
    $payload.apps = @($sessions | ForEach-Object { $_.SourceAppUserModelId } | Sort-Object -Unique)

    $session = Select-Session $sessions
    if ($null -ne $session) {
      $props = Await ($session.TryGetMediaPropertiesAsync()) ($propsType)
      if ($null -ne $props) {
        $payload.track = [ordered]@{
          app = $session.SourceAppUserModelId
          title = $props.Title
          artist = $props.Artist
          album = $props.AlbumTitle
          status = "$($session.GetPlaybackInfo().PlaybackStatus)"
        }
      }
    }
  } catch {
    # Плеер закрылся прямо посреди опроса — не повод ронять весь скрипт.
    $payload.track = $null
  }

  Write-Output ($payload | ConvertTo-Json -Compress -Depth 4)
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds $IntervalMs
}
