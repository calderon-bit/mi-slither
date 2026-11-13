const socket = io({ transports: ['websocket'] });
const canvas = document.getElementById('juego');
const ctx = canvas.getContext('2d', { alpha: false });

const menu = document.getElementById('menu');
const nombreInput = document.getElementById('nombreInput');
const btnJugar = document.getElementById('btnJugar');
const listaTop = document.getElementById('listaTop');

let estado = { jugadores: {}, comida: [], mapa: { ancho: 3000, alto: 3000 } };
let visualJugadores = {};
let mouse = { x: 0, y: 0 };
let turbo = false;
let jugando = false;
let camX = 1500;
let camY = 1500;
let ultimoTiempo = performance.now();

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
        vis.color = real.color;

        if (id === socket.id) {
            // Predicción local instantánea para cero lag al mover el mouse
            const anguloLocal = Math.atan2(mouse.y, mouse.x);
            vis.angulo = anguloLocal;
            const vel = (turbo && real.longitud > 15) ? 4.5 * 1.8 : 4.5;

            vis.x += Math.cos(anguloLocal) * vel * escala;
            vis.y += Math.sin(anguloLocal) * vel * escala;

            // Corrección suave hacia la posición real del servidor
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

    // Círculo oscuro semitransparente estilo Slither.io
    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();

    // Cruz tenue en el centro del radar
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radio, cy);
    ctx.lineTo(cx + radio, cy);
    ctx.moveTo(cx, cy - radio);
    ctx.lineTo(cx, cy + radio);
    ctx.stroke();

    // Puntos de comida diminutos
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let c of estado.comida) {
        const nx = (c.x / estado.mapa.ancho) * 2 - 1;
        const ny = (c.y / estado.mapa.alto) * 2 - 1;
        const px = cx + nx * (radio - 6);
        const py = cy + ny * (radio - 6);
        if (Math.hypot(px - cx, py - cy) < radio - 4) {
            ctx.fillRect(px, py, 1.5, 1.5);
        }
    }

    // Puntos de jugadores en el radar
    for (let id in visualJugadores) {
        const j = visualJugadores[id];
        const nx = (j.x / estado.mapa.ancho) * 2 - 1;
        const ny = (j.y / estado.mapa.alto) * 2 - 1;
        const px = cx + nx * (radio - 6);
        const py = cy + ny * (radio - 6);

        ctx.beginPath();
        if (miJugador && j.id === miJugador.id) {
            ctx.fillStyle = '#ffffff';
            ctx.arc(px, py, 3.8, 0, Math.PI * 2);
        } else {
            ctx.fillStyle = '#ff4444';
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

    ctx.fillStyle = '#141820';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const yo = visualJugadores[socket.id];
    if (yo) {
        camX = yo.x;
        camY = yo.y;
    }

    ctx.save();
    ctx.translate(canvas.width / 2 - camX, canvas.height / 2 - camY);

    // Cuadrícula optimizada (solo lo visible en pantalla)
    ctx.strokeStyle = '#1f2633';
    ctx.lineWidth = 1;
    const paso = 60;
    const inicioX = Math.max(0, Math.floor((camX - canvas.width / 2) / paso) * paso);
    const finX = Math.min(estado.mapa.ancho, camX + canvas.width / 2 + paso);
    const inicioY = Math.max(0, Math.floor((camY - canvas.height / 2) / paso) * paso);
    const finY = Math.min(estado.mapa.alto, camY + canvas.height / 2 + paso);

    ctx.beginPath();
    for (let x = inicioX; x <= finX; x += paso) {
        ctx.moveTo(x, inicioY);
        ctx.lineTo(x, finY);
    }
    for (let y = inicioY; y <= finY; y += paso) {
        ctx.moveTo(inicioX, y);
        ctx.lineTo(finX, y);
    }
    ctx.stroke();

    // Borde rojo del mapa
    ctx.strokeStyle = '#ff3344';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, estado.mapa.ancho, estado.mapa.alto);

    // Comida visible
    for (let c of estado.comida) {
        if (Math.abs(c.x - camX) > canvas.width / 2 + 25 || Math.abs(c.y - camY) > canvas.height / 2 + 25) continue;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = c.c;
        ctx.fill();
    }

    // Serpientes
    for (let id in visualJugadores) {
        const j = visualJugadores[id];

        ctx.fillStyle = j.color;
        for (let i = j.segmentos.length - 1; i >= 0; i--) {
            const seg = j.segmentos[i];
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, j.radio, 0, Math.PI * 2);
            ctx.fill();
        }

        if (j.turbo) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(j.x, j.y, j.radio + 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Ojos
        const ojoDist = j.radio * 0.55;
        const ojoRadio = j.radio * 0.3;
        const ang1 = j.angulo - 0.5;
        const ang2 = j.angulo + 0.5;

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(j.x + Math.cos(ang1) * ojoDist, j.y + Math.sin(ang1) * ojoDist, ojoRadio, 0, Math.PI * 2);
        ctx.arc(j.x + Math.cos(ang2) * ojoDist, j.y + Math.sin(ang2) * ojoDist, ojoRadio, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(j.x + Math.cos(ang1) * (ojoDist + 2), j.y + Math.sin(ang1) * (ojoDist + 2), ojoRadio * 0.5, 0, Math.PI * 2);
        ctx.arc(j.x + Math.cos(ang2) * (ojoDist + 2), j.y + Math.sin(ang2) * (ojoDist + 2), ojoRadio * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Apodo
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(j.nombre, j.x, j.y - j.radio - 10);
    }

    ctx.restore();

    if (jugando) {
        dibujarMinimapaSlither(yo);
    }

    requestAnimationFrame(dibujar);
}

requestAnimationFrame(dibujar);
