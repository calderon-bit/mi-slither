const socket = io({ transports: ['websocket'] });
const canvas = document.getElementById('juego');
const ctx = canvas.getContext('2d', { alpha: false });

const menu = document.getElementById('menu');
const nombreInput = document.getElementById('nombreInput');
const btnJugar = document.getElementById('btnJugar');
const listaTop = document.getElementById('listaTop');

const VELOCIDAD_GIRO = 0.085;

let estado = { jugadores: {}, comida: [], orbesX2: [], mapa: { ancho: 3000, alto: 3000 } };
let visualJugadores = {};
let mouse = { x: 0, y: 0 };
let turbo = false;
let jugando = false;
let camX = 1500;
let camY = 1500;
let ultimoTiempo = performance.now();

// Textura hexagonal realista pre-renderizada (cero consumo de FPS)
const patronSuelo = (() => {
    const tile = document.createElement('canvas');
    const r = 28;
    const w = r * Math.sqrt(3);
    const h = r * 1.5;
    tile.width = w * 2;
    tile.height = h * 2;
    const tctx = tile.getContext('2d');

    tctx.fillStyle = '#181c22';
    tctx.fillRect(0, 0, tile.width, tile.height);

    function hex(cx, cy) {
        tctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const ang = (Math.PI / 3) * i - Math.PI / 6;
            const px = cx + (r - 2) * Math.cos(ang);
            const py = cy + (r - 2) * Math.sin(ang);
            if (i === 0) tctx.moveTo(px, py);
            else tctx.lineTo(px, py);
        }
        tctx.closePath();
        tctx.fillStyle = '#1d2229';
        tctx.fill();
        tctx.strokeStyle = '#13161b';
        tctx.lineWidth = 1.5;
        tctx.stroke();
    }

    hex(0, 0); hex(w, 0); hex(w * 2, 0);
    hex(w / 2, h); hex(w * 1.5, h);
    hex(0, h * 2); hex(w, h * 2); hex(w * 2, h * 2);

    return ctx.createPattern(tile, 'repeat');
})();

// Caché de esferas 3D sombreadas para que las serpientes tengan volumen realista sin lag
const cacheSegmentos = {};
function obtenerSpriteSegmento(color, radio, esClaro) {
    const key = `${color}_${radio}_${esClaro ? 1 : 0}`;
    if (cacheSegmentos[key]) return cacheSegmentos[key];

    const size = (radio + 4) * 2;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const sctx = c.getContext('2d');
    const mid = size / 2;

    // Sombra suave debajo del segmento
    sctx.beginPath();
    sctx.arc(mid, mid + 2, radio, 0, Math.PI * 2);
    sctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    sctx.fill();

    // Degradado esférico 3D (luz superior izquierda, sombra inferior)
    const grad = sctx.createRadialGradient(
        mid - radio * 0.3, mid - radio * 0.3, radio * 0.1,
        mid, mid, radio
    );
    grad.addColorStop(0, esClaro ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)');
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, '#0b0d10');

    sctx.beginPath();
    sctx.arc(mid, mid, radio, 0, Math.PI * 2);
    sctx.fillStyle = color;
    sctx.fill();

    sctx.fillStyle = grad;
    sctx.fill();

    cacheSegmentos[key] = c;
    return c;
}

function ajustarPantalla() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', ajustarPantalla);
ajustarPantalla();

btnJugar.addEventListener('click', () => {
    const nombre = nombreInput.value.trim() || 'Jugador';
    socket.emit('unirse', nombre);
    menu.style.display = 'none';
    jugando = true;
});

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX - canvas.width / 2;
    mouse.y = e.clientY - canvas.height / 2;
});

window.addEventListener('mousedown', () => turbo = true);
window.addEventListener('mouseup', () => turbo = false);
window.addEventListener('keydown', (e) => { if (e.code === 'Space') turbo = true; });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') turbo = false; });

setInterval(() => {
    if (jugando) {
        const angulo = Math.atan2(mouse.y, mouse.x);
        socket.emit('input', { angulo, turbo });
    }
}, 1000 / 25);

socket.on('estado', (nuevoEstado) => {
    estado = nuevoEstado;
    actualizarTabla();
});

socket.on('muerto', () => {
    jugando = false;
    menu.style.display = 'flex';
});

function normalizarAngulo(ang) {
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    return ang;
}

function actualizarTabla() {
    const ordenados = Object.values(estado.jugadores)
        .sort((a, b) => b.longitud - a.longitud)
        .slice(0, 5);

    listaTop.innerHTML = ordenados
        .map((j, index) => `<li><span>${index + 1}. ${j.nombre}</span><span>${Math.floor(j.longitud * 10)}</span></li>`)
        .join('');
}

function actualizarFisicaVisual(dt) {
    const escala = dt / (1000 / 30);

    for (let id in visualJugadores) {
        if (!estado.jugadores[id]) delete visualJugadores[id];
    }

    for (let id in estado.jugadores) {
        const real = estado.jugadores[id];
        if (!visualJugadores[id]) {
            visualJugadores[id] = JSON.parse(JSON.stringify(real));
            continue;
        }

        const vis = visualJugadores[id];
        vis.nombre = real.nombre;
        vis.radio = real.radio;
        vis.turbo = real.turbo;
        vis.doble = real.doble;
        vis.tiempoDoble = real.tiempoDoble;
        vis.color = real.color;

        if (id === socket.id) {
            const anguloObjetivo = Math.atan2(mouse.y, mouse.x);
            const pasoGiro = VELOCIDAD_GIRO * escala;
            const diff = normalizarAngulo(anguloObjetivo - vis.angulo);

            if (Math.abs(diff) <= pasoGiro) {
                vis.angulo = anguloObjetivo;
            } else {
                vis.angulo = normalizarAngulo(vis.angulo + Math.sign(diff) * pasoGiro);
            }

            const vel = (turbo && real.longitud > 15) ? 4.5 * 1.8 : 4.5;
            vis.x += Math.cos(vis.angulo) * vel * escala;
            vis.y += Math.sin(vis.angulo) * vel * escala;

            vis.x += (real.x - vis.x) * 0.25;
            vis.y += (real.y - vis.y) * 0.25;
        } else {
            vis.angulo = real.angulo;
            vis.x += (real.x - vis.x) * 0.35;
            vis.y += (real.y - vis.y) * 0.35;
        }

        while (vis.segmentos.length < real.segmentos.length) {
            const ultimo = vis.segmentos[vis.segmentos.length - 1] || { x: vis.x, y: vis.y };
            vis.segmentos.push({ x: ultimo.x, y: ultimo.y });
        }
        while (vis.segmentos.length > real.segmentos.length) {
            vis.segmentos.pop();
        }

        if (vis.segmentos.length > 0) {
            vis.segmentos[0].x = vis.x;
            vis.segmentos[0].y = vis.y;
            for (let i = 1; i < real.segmentos.length; i++) {
                vis.segmentos[i].x += (real.segmentos[i].x - vis.segmentos[i].x) * 0.4;
                vis.segmentos[i].y += (real.segmentos[i].y - vis.segmentos[i].y) * 0.4;
            }
        }
    }
}

function dibujarMinimapaSlither(miJugador) {
    const radio = 65;
    const cx = canvas.width - radio - 25;
    const cy = canvas.height - radio - 25;

    ctx.save();

    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 18, 22, 0.72)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radio, cy);
    ctx.lineTo(cx + radio, cy);
    ctx.moveTo(cx, cy - radio);
    ctx.lineTo(cx, cy + radio);
    ctx.stroke();

    ctx.fillStyle = 'rgba(220, 220, 220, 0.25)';
    for (let c of estado.comida) {
        const nx = (c.x / estado.mapa.ancho) * 2 - 1;
        const ny = (c.y / estado.mapa.alto) * 2 - 1;
        const px = cx + nx * (radio - 6);
        const py = cy + ny * (radio - 6);
        if (Math.hypot(px - cx, py - cy) < radio - 4) {
            ctx.fillRect(px, py, 1.5, 1.5);
        }
    }

    if (estado.orbesX2) {
        for (let o of estado.orbesX2) {
            const nx = (o.x / estado.mapa.ancho) * 2 - 1;
            const ny = (o.y / estado.mapa.alto) * 2 - 1;
            const px = cx + nx * (radio - 6);
            const py = cy + ny * (radio - 6);
            ctx.beginPath();
            ctx.fillStyle = '#d4a338';
            ctx.arc(px, py, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    for (let id in visualJugadores) {
        const j = visualJugadores[id];
        const nx = (j.x / estado.mapa.ancho) * 2 - 1;
        const ny = (j.y / estado.mapa.alto) * 2 - 1;
        const px = cx + nx * (radio - 6);
        const py = cy + ny * (radio - 6);

        ctx.beginPath();
        if (miJugador && j.id === miJugador.id) {
            ctx.fillStyle = '#e8ecef';
            ctx.arc(px, py, 3.8, 0, Math.PI * 2);
        } else {
            ctx.fillStyle = '#c94a4a';
            ctx.arc(px, py, 2.8, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    ctx.restore();
}

function dibujar(ahora) {
    const dt = Math.min(50, ahora - ultimoTiempo);
    ultimoTiempo = ahora;

    actualizarFisicaVisual(dt);

    ctx.fillStyle = '#111418';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const yo = visualJugadores[socket.id];
    if (yo) {
        camX = yo.x;
        camY = yo.y;
    }

    ctx.save();
    ctx.translate(canvas.width / 2 - camX, canvas.height / 2 - camY);

    // Suelo hexagonal texturizado dentro del área de juego
    ctx.fillStyle = patronSuelo;
    ctx.fillRect(0, 0, estado.mapa.ancho, estado.mapa.alto);

    // Borde de arena/límite natural oscuro con línea roja tenue
    ctx.strokeStyle = '#8f2d2d';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, estado.mapa.ancho, estado.mapa.alto);

    // Puntitos de comida orgánicos con brillo sutil
    for (let c of estado.comida) {
        if (Math.abs(c.x - camX) > canvas.width / 2 + 25 || Math.abs(c.y - camY) > canvas.height / 2 + 25) continue;

        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = c.c;
        ctx.fill();
    }

    // Orbes especiales x2 (ámbar dorado natural)
    if (estado.orbesX2) {
        const pulso = Math.sin(ahora / 200) * 3;
        for (let o of estado.orbesX2) {
            ctx.beginPath();
            ctx.arc(o.x, o.y, 19 + pulso, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(212, 163, 56, 0.22)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(o.x, o.y, 13, 0, Math.PI * 2);
            ctx.fillStyle = '#d4a338';
            ctx.fill();
            ctx.strokeStyle = '#8a6518';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = '#181c22';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('x2', o.x, o.y);
        }
    }

    // Serpientes con volumen 3D y patrón de escamas natural
    for (let id in visualJugadores) {
        const j = visualJugadores[id];

        for (let i = j.segmentos.length - 1; i >= 0; i--) {
            const seg = j.segmentos[i];
            const esFranjaClara = (Math.floor(i / 3) % 2 === 0);
            const sprite = obtenerSpriteSegmento(j.color, j.radio, esFranjaClara);
            const offset = sprite.width / 2;
            ctx.drawImage(sprite, seg.x - offset, seg.y - offset);
        }

        // Halo sutil si tiene x2 o turbo
        if (j.doble) {
            ctx.strokeStyle = 'rgba(212, 163, 56, 0.7)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(j.x, j.y, j.radio + 3, 0, Math.PI * 2);
            ctx.stroke();
        } else if (j.turbo) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(j.x, j.y, j.radio + 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Ojos realistas con pupila orientada hacia la dirección de movimiento
        const ojoDist = j.radio * 0.52;
        const ojoRadio = j.radio * 0.32;
        const ang1 = j.angulo - 0.52;
        const ang2 = j.angulo + 0.52;

        const ox1 = j.x + Math.cos(ang1) * ojoDist;
        const oy1 = j.y + Math.sin(ang1) * ojoDist;
        const ox2 = j.x + Math.cos(ang2) * ojoDist;
        const oy2 = j.y + Math.sin(ang2) * ojoDist;

        ctx.fillStyle = '#e8ecef';
        ctx.beginPath();
        ctx.arc(ox1, oy1, ojoRadio, 0, Math.PI * 2);
        ctx.arc(ox2, oy2, ojoRadio, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#111418';
        ctx.beginPath();
        ctx.arc(ox1 + Math.cos(j.angulo) * (ojoRadio * 0.42), oy1 + Math.sin(j.angulo) * (ojoRadio * 0.42), ojoRadio * 0.55, 0, Math.PI * 2);
        ctx.arc(ox2 + Math.cos(j.angulo) * (ojoRadio * 0.42), oy2 + Math.sin(j.angulo) * (ojoRadio * 0.42), ojoRadio * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Apodo discreto
        ctx.fillStyle = j.doble ? '#e6be6a' : 'rgba(232, 236, 239, 0.88)';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(j.nombre, j.x, j.y - j.radio - 10);
    }

    ctx.restore();

    if (jugando && yo && yo.doble) {
        ctx.fillStyle = '#e6be6a';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`PUNTOS x2 ACTIVO (${yo.tiempoDoble}s)`, canvas.width / 2, 34);
    }

    if (jugando) {
        dibujarMinimapaSlither(yo);
    }

    requestAnimationFrame(dibujar);
}

requestAnimationFrame(dibujar);
