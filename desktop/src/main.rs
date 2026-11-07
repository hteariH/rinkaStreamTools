// rinkaStreamTools — окно панели управления и сервер в одном приложении, чтобы
// запуск был одним ярлыком, а не командой в терминале.
//
// Внутри окно и сервер:
//   panel   — обычное окно с панелью управления;
//   сервер  — дочерний процесс, поднимается сам и гаснет вместе с приложением.
//
// Окно показывает страницу того же локального сервера, что и Browser Source
// в OBS, — своего фронтенда у приложения нет.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use server::Server;

const PANEL: &str = "panel";

struct ServerHandle(Mutex<Server>);

fn main() {
    let server = Server::start();
    // Окна создаём только когда порт ответил: иначе WebView2 покажет свою
    // страницу ошибки вместо панели, и объяснить это будет нечем.
    if !server.wait_ready() {
        eprintln!("Сервер не ответил на порту {} — окна откроются с ошибкой", server.port);
    }
    let host = host_for(server.port);

    let app = tauri::Builder::default()
        .setup({
            let host = host.clone();
            move |app| {
                build_panel(app.handle(), &host)?;
                build_tray(app.handle(), &host)?;
                Ok(())
            }
        })
        .on_window_event(|window, event| {
            // Крестик на панели прячет её в трей, а не закрывает приложение:
            // иначе стример посреди эфира уронил бы вместе с ней сервер.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == PANEL {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .manage(ServerHandle(Mutex::new(server)))
        .build(tauri::generate_context!())
        .expect("не удалось собрать приложение");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(handle) = app.try_state::<ServerHandle>() {
                if let Ok(mut server) = handle.0.lock() {
                    server.stop();
                }
            }
        }
    });
}

/// Адрес сервера. RINKA_HOST позволяет смотреть на сервер, поднятый отдельно, —
/// например на другой машине в локальной сети.
fn host_for(port: u16) -> String {
    std::env::var("RINKA_HOST").unwrap_or_else(|_| format!("http://localhost:{port}"))
}

fn build_panel(app: &tauri::AppHandle, host: &str) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, PANEL, WebviewUrl::External(host.parse().unwrap()))
        .title("rinkaStreamTools")
        .inner_size(1180.0, 840.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .build()?;
    window.set_focus()?;
    Ok(())
}

fn build_tray(app: &tauri::AppHandle, host: &str) -> tauri::Result<()> {
    let panel = MenuItem::with_id(app, "panel", "Панель управления", true, None::<&str>)?;
    let reload = MenuItem::with_id(app, "reload", "Переподключиться", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&panel, &reload, &quit])?;

    let mut tray = TrayIconBuilder::new()
        .tooltip(format!("rinkaStreamTools: {host}"))
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "panel" => {
                if let Some(window) = app.get_webview_window(PANEL) {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            // Если сеть отваливалась надолго, перезагрузить страницу целиком
            // проще, чем ждать реконнекта.
            "reload" => {
                if let Some(window) = app.get_webview_window(PANEL) {
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
