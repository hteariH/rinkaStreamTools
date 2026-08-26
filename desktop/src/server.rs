// Локальный сервер как дочерний процесс приложения.
//
// Пользователь запускает один ярлык, поэтому сервер поднимает само приложение,
// а не человек из терминала. Его вывод уходит в server.log рядом с exe: консоли у
// приложения нет, и иначе причину падения было бы неоткуда взять.

use std::fs::File;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

const DEFAULT_PORT: u16 = 3777;
const WAIT_TIMEOUT: Duration = Duration::from_secs(25);
const EXE_NAME: &str = if cfg!(windows) {
    "rinkaStreamTools-server.exe"
} else {
    "rinkaStreamTools-server"
};

pub struct Server {
    pub port: u16,
    child: Option<Child>,
}

impl Server {
    /// Поднимает сервер, если он лежит рядом. Если не лежит — считаем, что он уже
    /// запущен снаружи: так работает и разработка (`npm start` + `cargo run`), и
    /// случай, когда сервер живёт на другой машине.
    pub fn start() -> Self {
        let exe = locate();
        let port = exe.as_deref().and_then(port_from_config).unwrap_or(DEFAULT_PORT);

        let child = exe.and_then(|path| match spawn(&path) {
            Ok(child) => Some(child),
            Err(error) => {
                eprintln!("Не удалось запустить сервер: {error}");
                None
            }
        });

        Server { port, child }
    }

    /// Ждёт, пока порт начнёт отвечать. Возвращает false, если не дождались, —
    /// окно всё равно откроется, но уже с ошибкой загрузки.
    pub fn wait_ready(&self) -> bool {
        let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, self.port);
        let deadline = Instant::now() + WAIT_TIMEOUT;

        while Instant::now() < deadline {
            if TcpStream::connect_timeout(&address.into(), Duration::from_millis(500)).is_ok() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        false
    }

    /// Сервер — дочерний процесс, и без этого он пережил бы закрытие приложения,
    /// заняв порт до перезагрузки.
    pub fn stop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
    }
}

/// Сервер лежит в подпапке server рядом с приложением — так в папке остаётся
/// ровно один файл, по которому надо щёлкать. Рядом тоже смотрим: удобно при
/// ручной раскладке.
fn locate() -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    [dir.join("server").join(EXE_NAME), dir.join(EXE_NAME)]
        .into_iter()
        .find(|path| path.is_file())
}

fn spawn(exe: &Path) -> std::io::Result<Child> {
    let dir = exe.parent().unwrap_or_else(|| Path::new("."));
    let log = File::create(dir.join("server.log"))?;
    let errors = log.try_clone()?;

    let mut command = Command::new(exe);
    command
        .current_dir(dir)
        // Штатно сервер гасим сами, но приложение могут и снять через диспетчер
        // задач — тогда сервер уйдёт следом сам, увидев, что нас больше нет.
        .env("RINKA_PARENT_PID", std::process::id().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(errors));

    // Без этого у сервера открылось бы собственное окно консоли — ровно то, от
    // чего приложение и избавляет.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.spawn()
}

/// Порт берём из конфига сервера: пользователь мог сменить его в панели.
fn port_from_config(exe: &Path) -> Option<u16> {
    let path = exe.parent()?.join("config.json");
    let raw = match std::fs::read_to_string(path) {
        Ok(raw) => raw,
        // Конфига ещё нет — это нормально, сервер создаст его при первом запуске.
        Err(error) if error.kind() == ErrorKind::NotFound => return None,
        Err(_) => return None,
    };

    serde_json::from_str::<serde_json::Value>(&raw)
        .ok()?
        .get("port")?
        .as_u64()
        .and_then(|port| u16::try_from(port).ok())
}
