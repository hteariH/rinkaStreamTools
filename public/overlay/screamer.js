/*
 * Оверлей скримеров. Слушает /ws/screamer и на каждый донат проигрывает эффект.
 * Сервер присылает только тир (small / medium / big) и длительность, а какую именно
 * вариацию показать — решается здесь и выбирается случайно из подходящих тиру.
 *
 * Каждая вариация ещё и сама тянет случайную картинку и случайный звук из своего
 * набора, поэтому один и тот же эффект дважды подряд выглядит по-разному.
 *
 * Медиа лежит в /screamers: фотографии с Pexels (лицензия разрешает коммерческое
 * использование без атрибуции), прогнанные через цветокоррекцию, и звуки CC0
 * с Freesound. Ассеты самой Resident Evil не используются намеренно — они
 * принадлежат Capcom и ловят претензии по контенту на стриме.
 *
 * Отладка:
 *   /screamer?ping           — мигнуть меткой при подключении
 *   /screamer?variant=heart  — сердечко: проверка связки, которая не пугает
 *   /screamer?variant=lunge  — всегда показывать одну конкретную вариацию
 *   /screamer?demo           — прогнать все вариации подряд, ничего не ожидая от сервера
 *   /screamer?opacity=0.6    — подобрать, насколько скример перекрывает игру
 */

/*
 * Кадры сгруппированы по тому, как они работают, а не по сюжету:
 * лица бьют в лоб, тёмные нужны для медленного проявления, а тянущиеся руки —
 * для наездов и появлений сбоку.
 */
const IMAGES = {
    // крупные планы: читаются мгновенно, годятся для удара
    closeEyes: '/screamers/img/close-eyes.jpg',
    scream: '/screamers/img/scream.jpg',
    skullEyes: '/screamers/img/skull-eyes.jpg',
    greyFace: '/screamers/img/grey-face.jpg',
    queen: '/screamers/img/queen.jpg',
    rotten: '/screamers/img/rotten.jpg',
    bulging: '/screamers/img/bulging.jpg',
    mask: '/screamers/img/mask.jpg',

    // тёмные и атмосферные: работают на проявлении из черноты
    darkFace: '/screamers/img/dark-face.jpg',
    hooded: '/screamers/img/hooded.jpg',
    leaning: '/screamers/img/leaning.jpg',
    forest: '/screamers/img/forest.jpg',
    doorway: '/screamers/img/doorway.jpg',
    foliage: '/screamers/img/foliage.jpg',

    // движение в кадре: тянущиеся руки и заглядывание
    hands: '/screamers/img/hands.jpg',
    windowHand: '/screamers/img/window-hand.jpg',
    window: '/screamers/img/window.jpg',
};

const SOUNDS = {
    scream: '/screamers/sfx/scream.mp3',
    roar: '/screamers/sfx/roar.mp3',
    roarLow: '/screamers/sfx/roar-low.mp3',
    stinger: '/screamers/sfx/stinger.mp3',
    swoosh: '/screamers/sfx/swoosh.mp3',
    pianoHit: '/screamers/sfx/piano-hit.mp3',
    splat: '/screamers/sfx/splat.mp3',
    growl: '/screamers/sfx/growl.mp3',
    static: '/screamers/sfx/static.mp3',
    drone: '/screamers/sfx/drone.mp3',
};

const COOLDOWN_MS = 800;

const stage = document.getElementById('stage');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);

const queue = [];
let playing = false;
let reconnectTimer;
let lastVariantName = null;

/* ------------------------------------------------------------------ разметка */

function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

function text(tag, className, value) {
    const node = el(tag, className);
    node.innerText = value;                      // именно innerText: имя донатера — чужой ввод
    return node;
}

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

/** Кадр во весь экран. Картинки заранее прогреты, поэтому появляются без задержки. */
function shot(imageKey, extraClass = '') {
    const image = el('img', `shot ${extraClass}`);
    image.src = IMAGES[imageKey];
    image.alt = '';
    return image;
}

function caption(data, extraClass = '') {
    const box = el('div', `caption ${extraClass}`);
    if (data.donorName) box.appendChild(text('div', 'caption__donor', data.donorName));
    box.appendChild(text('div', 'caption__amount', formatAmount(data)));
    if (data.message) box.appendChild(text('div', 'caption__message', data.message));
    return box;
}

function formatAmount(data) {
    if (data.amount === null || data.amount === undefined) return '';
    const amount = Number(data.amount);
    const rounded = Number.isInteger(amount) ? amount : amount.toFixed(2);
    return `${rounded} ${data.currency || ''}`.trim();
}

function grain() {
    return el('div', 'grain');
}

/* --------------------------------------------------------------------- звук */

const audioCache = new Map();

/**
 * Играем через отдельный элемент на каждый вызов: один и тот же звук может
 * накладываться сам на себя, а перемотка общего элемента даёт щелчок.
 */
function play(soundKey, { delay = 0, volume = 1 } = {}) {
    const source = SOUNDS[soundKey];
    if (!source) return;

    setTimeout(() => {
        const audio = new Audio(source);
        audio.volume = Math.min(1, Math.max(0, volume));
        audio.play().catch(error => console.warn('Не удалось проиграть звук:', error));
    }, delay * 1000);
}

/** Прогрев: без него первый скример показывает пустоту, пока грузится файл. */
function preload() {
    Object.values(IMAGES).forEach(source => {
        const image = new Image();
        image.src = source;
    });

    Object.entries(SOUNDS).forEach(([key, source]) => {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = source;
        audioCache.set(key, audio);
    });
}

/* -------------------------------------------------------------- вариации */

const VARIANTS = {
    /* Бросок на камеру: кадр наезжает и трясётся. Самый прямолинейный. */
    lunge: {
        tiers: ['big'],
        images: ['closeEyes', 'scream', 'queen', 'rotten', 'bulging', 'greyFace', 'hands'],
        render(data, image) {
            const root = el('div', 'variant variant--lunge');
            root.appendChild(shot(image, 'shot--lunge'));
            root.appendChild(el('div', 'red-flash'));
            root.appendChild(grain());
            return root;
        },
        sound() {
            play(pick(['scream', 'roar', 'roarLow']));
            play('pianoHit', { volume: 0.7 });
        },
    },

    /* Подсечка: лицо на пару кадров и сразу прочь. Коротко и подло. */
    flash: {
        caption: 'caption--late',
        tiers: ['small', 'medium'],
        images: ['closeEyes', 'skullEyes', 'scream', 'mask', 'bulging', 'greyFace', 'rotten'],
        render(data, image) {
            const root = el('div', 'variant variant--flash');
            root.appendChild(shot(image, 'shot--flash'));
            root.appendChild(grain());
            return root;
        },
        sound() {
            play(pick(['stinger', 'swoosh']));
        },
    },

    /* Строб: два кадра мигают вперемешку, глаз не успевает собрать картинку. */
    strobe: {
        tiers: ['big'],
        images: ['closeEyes', 'scream', 'skullEyes', 'queen', 'bulging', 'mask', 'rotten'],
        render(data, image) {
            const root = el('div', 'variant variant--strobe');
            root.appendChild(shot(image, 'shot--strobe-a'));
            // Вторая картинка обязательно другая, иначе мигание не читается.
            const other = pick(this.images.filter(name => name !== image));
            root.appendChild(shot(other, 'shot--strobe-b'));
            root.appendChild(el('div', 'red-flash'));
            root.appendChild(grain());
            return root;
        },
        sound() {
            play('pianoHit');
            play(pick(['roar', 'scream']), { delay: 0.15 });
        },
    },

    /* Фонарь: темнота, луч шарит по кадру и высвечивает фигуру. */
    flashlight: {
        caption: 'caption--late',
        tiers: ['medium', 'big'],
        images: ['doorway', 'darkFace', 'forest', 'hooded', 'leaning', 'foliage'],
        render(data, image) {
            const root = el('div', 'variant variant--flashlight');
            root.appendChild(shot(image, 'shot--reveal'));
            root.appendChild(el('div', 'beam'));
            root.appendChild(grain());
            return root;
        },
        sound() {
            play('drone', { volume: 0.55 });
            play(pick(['roar', 'growl']), { delay: 1.7 });
        },
    },

    /* Кровь на объективе поверх кадра. Брызги каждый раз ложатся по-новому. */
    blood: {
        tiers: ['big'],
        images: ['foliage', 'closeEyes', 'hands', 'queen', 'rotten', 'window'],
        render(data, image) {
            const root = el('div', 'variant variant--blood');
            root.appendChild(shot(image, 'shot--slow'));
            for (let i = 0; i < 14; i++) {
                const splat = el('i', 'splat');
                const size = 40 + Math.random() * 180;
                splat.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;` +
                    `width:${size}px;height:${size * (0.6 + Math.random() * 0.8)}px;` +
                    `animation-delay:${Math.random() * 0.35}s`;
                root.appendChild(splat);
            }
            root.appendChild(grain());
            return root;
        },
        sound() {
            play('splat');
            play('growl', { delay: 0.2 });
        },
    },

    /* Помехи: кадр рвётся полосами, как на зажёванной ленте. */
    vhs: {
        caption: 'caption--glitch',
        tiers: ['small', 'medium'],
        images: ['skullEyes', 'window', 'darkFace', 'mask', 'windowHand', 'leaning'],
        render(data, image) {
            const root = el('div', 'variant variant--vhs');
            root.appendChild(shot(image, 'shot--glitch'));
            root.appendChild(el('div', 'scanlines'));
            root.appendChild(el('div', 'band'));
            root.appendChild(grain());
            return root;
        },
        sound() {
            play('static', { volume: 0.8 });
            play('swoosh', { delay: 1.2, volume: 0.7 });
        },
    },

    /* Подкрадывается: лицо медленно выплывает из черноты. Без удара — на нервы. */
    creep: {
        caption: 'caption--late',
        tiers: ['medium'],
        images: ['darkFace', 'hooded', 'leaning', 'forest', 'foliage', 'skullEyes'],
        render(data, image) {
            const root = el('div', 'variant variant--creep');
            root.appendChild(shot(image, 'shot--creep'));
            root.appendChild(grain());
            return root;
        },
        sound() {
            play('drone', { volume: 0.7 });
            play('stinger', { delay: 2.4 });
        },
    },

    /*
     * Сердечко — не скример, а проверка. Показывает, что оверлей жив, стоит там,
     * где надо, и с нужной прозрачностью, — но не пугает: проверять связку перед
     * эфиром, вздрагивая каждый раз, невозможно.
     *
     * check: true выводит вариацию из случайного набора, поэтому на настоящий
     * донат она не выпадет никогда — только если её выбрали руками.
     */
    heart: {
        check: true,
        caption: 'caption--check',
        tiers: [],
        images: [],
        render() {
            const root = el('div', 'variant variant--heart');
            root.appendChild(el('div', 'heart-glow'));

            const heart = el('div', 'heart');
            heart.innerHTML = HEART_SVG;
            root.appendChild(heart);

            // Мелкие сердечки летят вверх — заодно видно, что анимации не встали.
            for (let i = 0; i < 12; i++) {
                const spark = el('i', 'heart-spark');
                spark.innerHTML = HEART_SVG;
                spark.style.cssText = `left:${5 + Math.random() * 90}%;` +
                    `--size:${14 + Math.random() * 26}px;` +
                    `animation-delay:${Math.random() * 1.6}s;` +
                    `animation-duration:${2.4 + Math.random() * 1.8}s`;
                root.appendChild(spark);
            }
            return root;
        },
        sound() {
            chime();
        },
    },
};

const HEART_SVG =
    '<svg viewBox="0 0 32 29" aria-hidden="true">' +
    '<path d="M16 29S1 19.5 1 9.9A8.9 8.9 0 0 1 16 4a8.9 8.9 0 0 1 15 5.9C31 19.5 16 29 16 29z"/>' +
    '</svg>';

/**
 * Мягкий двузвучный сигнал вместо крика: проверка должна убедиться, что звук из
 * оверлея вообще доходит до OBS, и при этом не бить по ушам. Синтезируем на месте,
 * чтобы не тащить ещё один файл ради одной кнопки.
 */
function chime() {
    try {
        const audio = new (window.AudioContext || window.webkitAudioContext)();
        [[880, 0], [1320, 0.16]].forEach(([freq, at]) => {
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            // Плавное затухание: резкий обрыв синуса даёт щелчок.
            gain.gain.setValueAtTime(0.0001, audio.currentTime + at);
            gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.5);
            osc.connect(gain).connect(audio.destination);
            osc.start(audio.currentTime + at);
            osc.stop(audio.currentTime + at + 0.55);
        });
        setTimeout(() => audio.close(), 1500);
    } catch (error) {
        console.warn('Не удалось проиграть сигнал проверки:', error);
    }
}

/* ---------------------------------------------------------------- показ */

/**
 * Списки tiers у вариаций описывают их силу и работают, только если сервер
 * присылает соответствующий тир. Сейчас тир один общий, ни одна вариация его
 * не объявляет — и тогда доступны все, что и нужно при едином пороге.
 */
function variantsFor(tier) {
    const forced = params.get('variant');
    if (forced && VARIANTS[forced]) return [forced];

    // Проверочные вариации показываются только по прямому выбору, иначе сердечко
    // выпало бы вместо скримера на настоящем донате.
    const real = Object.keys(VARIANTS).filter(name => !VARIANTS[name].check);
    const suitable = real.filter(name => VARIANTS[name].tiers.includes(tier));
    return suitable.length ? suitable : real;
}

function pickVariant(tier) {
    const names = variantsFor(tier);
    // Два одинаковых скримера подряд бьют по эффекту неожиданности.
    const fresh = names.length > 1 ? names.filter(name => name !== lastVariantName) : names;
    const name = pick(fresh);
    lastVariantName = name;
    return name;
}

function show(data) {
    const tier = data.tier || 'small';
    const duration = data.durationMs || 4000;
    const name = data.variant && VARIANTS[data.variant] ? data.variant : pickVariant(tier);
    const variant = VARIANTS[name];
    const image = pick(variant.images);

    stage.innerHTML = '';
    stage.className = `stage stage--active stage--${tier}`;
    stage.appendChild(variant.render(data, image));
    // Подпись живёт рядом с вариацией, а не внутри неё: сама вариация
    // полупрозрачная, а ник и сумма должны оставаться читаемыми.
    stage.appendChild(caption(data, variant.caption || ''));
    variant.sound();

    setTimeout(() => {
        stage.className = 'stage';
        stage.innerHTML = '';
        setTimeout(() => { playing = false; playNext(); }, COOLDOWN_MS);
    }, duration);
}

/* Донаты во время эфира идут пачками, поэтому показываем строго по одному. */
function playNext() {
    if (playing || queue.length === 0) return;
    playing = true;
    show(queue.shift());
}

/* --------------------------------------------------------------- сокет */

function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/screamer`);

    socket.addEventListener('open', () => {
        status.innerText = 'Подключено';
        // В простое оверлей полностью невидим, поэтому убедиться, что он жив,
        // можно только так: открыть /screamer?ping — при подключении мигнёт метка.
        if (params.has('ping')) {
            status.classList.add('status--visible');
            setTimeout(() => status.classList.remove('status--visible'), 4000);
        }
    });

    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        // Прозрачность задаётся в панели управления и приезжает при подключении
        // и при сохранении настроек — перезагружать источник в OBS не нужно.
        if (message.type === 'hello') {
            applyOpacity(message.opacity);
            return;
        }
        if (message.type !== 'screamer') return;
        queue.push(message);
        playNext();
    });

    socket.addEventListener('close', scheduleReconnect);
    socket.addEventListener('error', () => socket.close());
}

function scheduleReconnect() {
    status.innerText = 'Переподключение...';
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3000);
}

/** Прогон всех вариаций подряд — чтобы посмотреть их, не дожидаясь донатов. */
function runDemo() {
    status.innerText = 'Демонстрация';
    status.classList.add('status--visible');

    Object.keys(VARIANTS).forEach((name, index) => {
        queue.push({
            type: 'screamer',
            variant: name,
            tier: VARIANTS[name].tiers[VARIANTS[name].tiers.length - 1] || 'check',
            durationMs: 4500,
            donorName: `Вариация: ${name}`,
            amount: 25,
            currency: 'USD',
            message: index === 0 ? 'демонстрация всех вариаций' : '',
        });
    });
    playNext();
}

/**
 * Прозрачность из панели управления. Значение в адресе имеет приоритет: им
 * подбирают наложение вживую, и присланное сервером не должно его сбивать.
 */
function applyOpacity(value) {
    if (params.has('opacity')) return;
    const opacity = Number(value);
    if (!Number.isFinite(opacity)) return;
    document.documentElement.style.setProperty('--screamer-opacity', String(opacity));
}

// Прозрачность подбирается вживую, без пересборки: /screamer?opacity=0.6
if (params.has('opacity')) {
    document.documentElement.style.setProperty('--screamer-opacity', params.get('opacity'));
}

preload();

if (params.has('demo')) {
    runDemo();
} else {
    connect();
}
