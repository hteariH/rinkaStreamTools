// Прозрачное окно поверх всех остальных: показывает скримеры на экране стримерши,
// пока она играет. Browser source в OBS виден только зрителям, поэтому нужен ещё и он.
//
// Внутри — та же самая страница /screamer, что и в сцене OBS, только в системном
// WebView2, а не в своём Chromium. Мышь и клавиатура сквозь окно уходят в игру.
//
// Само окно невидимо и клики не ловит, поэтому закрыть приложение можно только
// через иконку в трее — она и есть единственный элемент управления.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_HOST: &str = "http://localhost:3777";
const WINDOW_LABEL: &str = "overlay";

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let host = std::env::var("RINKA_HOST").unwrap_or_else(|_| DEFAULT_HOST.to_string());
            let url = std::env::var("SCREAMER_URL").unwrap_or_else(|_| format!("{host}/screamer"));
            println!("Оверлей открывает {url}");

            let window =
                WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(url.parse()?))
                    .title("rinkaStreamTools — скримеры")
                    .transparent(true)
                    .decorations(false)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .resizable(false)
                    .focused(false)
                    .shadow(false)
                    .build()?;

            // Растягиваем на весь основной монитор — размеры берём у него самого,
            // чтобы не гадать про масштабирование и несколько экранов.
            if let Some(monitor) = window.primary_monitor()? {
                window.set_position(*monitor.position())?;
                window.set_size(*monitor.size())?;
            }

            // Клики и наведение проходят насквозь: окно не мешает играть.
            window.set_ignore_cursor_events(true)?;

            build_tray(app.handle(), &url, host)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("не удалось запустить оверлей");
}

fn build_tray(app: &tauri::AppHandle, url: &str, host: String) -> tauri::Result<()> {
    let panel = MenuItem::with_id(app, "panel", "Панель управления", true, None::<&str>)?;
    let reconnect = MenuItem::with_id(app, "reconnect", "Переподключиться", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&panel, &reconnect, &quit])?;

    let mut tray = TrayIconBuilder::new()
        .tooltip(format!("Скримеры: {url}"))
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            // Панель живёт на том же сервере, что и страница скримеров, поэтому
            // отдельно её адрес настраивать не нужно.
            "panel" => open_in_browser(&host),
            // Если приложение перезапускали или сеть отвалилась надолго,
            // проще перезагрузить страницу целиком, чем ждать реконнекта.
            "reconnect" => {
                if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                    let _ = window.eval("window.location.reload()");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

/// Открыть адрес в браузере по умолчанию. Через `cmd /c start`, чтобы не тащить
/// отдельный плагин ради одного пункта меню; пустая строка после start — это
/// заголовок окна, без неё cmd примет за него сам адрес.
fn open_in_browser(url: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}
