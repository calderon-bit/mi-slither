const socket = io();
const canvas = document.getElementById('juego');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

const menu = document.getElementById('menu');
const jugarBtn = document.getElementById('jugarBtn');
const nombreInput = document.getElementById('nombreInput');
const listaRanking = document.getElementById('listaRanking');

let jugadores = {};
let comida = [];
let mapa = { ancho: 3000, alto: 3000 };
let mouse = { x: 0, y: 0 };
let turbo = false;

jugarBtn.addEventListener('click', () => {
    socket.emit('unirse', nombreInput.value);
    menu.style.display = 'none';
});

socket.on('muerto', () => {
    menu.style.display = 'flex';
});

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX - canvas.width / 2;
    mouse.y = e.clientY - canvas.height / 2;
});

window.addEventListener('mousedown', () => turbo = true);
window.addEventListener('mouseup', () => turbo = false);

setInterval(() => {
    const angulo = Math.atan2(mouse.y, mouse.x);
    socket.emit('input', { angulo, turbo });
}, 1000 / 60);

socket.on('estado', (datos) => {
    jugadores = datos.jugadores;
    comida = datos.comida;
    mapa = datos.mapa;
    actualizarRanking();
});

function actualizarRanking() {
    const ordenados = Object.values(jugadores).sort((a, b) => b.longitud - a.longitud).slice(0, 5);
    listaRanking.innerHTML = ordenados.map(j => `<li>${j.nombre}: ${Math.floor(j.longitud)}</li>`).join('');
}

function dibujarFondo(camX, camY) {
    ctx.fillStyle = '#161c22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tam = 50;
    ctx.strokeStyle = '#1f2730';
    ctx.lineWidth = 2;

    const inicioX = Math.floor(camX / tam) * tam - camX;
    const inicioY = Math.floor(camY / tam) * tam - camY;

    for (let x = inicioX; x < canvas.width; x += tam) {
        for (let y = inicioY; y < canvas.height; y += tam) {
            ctx.beginPath();
            ctx.arc(x, y, tam / 2.2, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    ctx.strokeStyle = '#ff2a55';
    ctx.lineWidth = 10;
    ctx.strokeRect(-camX, -camY, mapa.ancho, mapa.alto);
}

function dibujar() {
    const yo = jugadores[socket.id];
    let camX = 0;
    let camY = 0;

    if (yo) {
        camX = yo.x - canvas.width / 2;
        camY = yo.y - canvas.height / 2;
    }

    dibujarFondo(camX, camY);

    ctx.save();
    ctx.translate(-camX, -camY);

    for (let c of comida) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radio, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = c.color;
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    for (let id in jugadores) {
        let j = jugadores[id];

        if (j.turbo) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = j.color;
        }

        for (let i = j.segmentos.length - 1; i >= 0; i--) {
            let seg = j.segmentos[i];
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, j.radio, 0, Math.PI * 2);
            ctx.fillStyle = i % 2 === 0 ? j.color : '#222';
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        const ojoDist = j.radio * 0.5;
        const ojoAng1 = j.angulo - 0.6;
        const ojoAng2 = j.angulo + 0.6;

        [ojoAng1, ojoAng2].forEach(ang => {
            const ox = j.x + Math.cos(ang) * ojoDist;
            const oy = j.y + Math.sin(ang) * ojoDist;

            ctx.beginPath();
            ctx.arc(ox, oy, j.radio * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(ox + Math.cos(j.angulo) * 2, oy + Math.sin(j.angulo) * 2, j.radio * 0.18, 0, Math.PI * 2);
            ctx.fillStyle = 'black';
            ctx.fill();
        });

        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(j.nombre, j.x, j.y - j.radio - 10);
    }

    ctx.restore();
    requestAnimationFrame(dibujar);
}

dibujar();