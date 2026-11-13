const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    transports: ['websocket']
});

app.use(express.static(__dirname));

const MAPA_ANCHO = 3000;
const MAPA_ALTO = 3000;
const CANTIDAD_COMIDA = 450;
const VELOCIDAD_GIRO = 0.085;

const PALETA_REALISTA = [
    '#3b7a57', // Verde bosque
    '#2e5a88', // Azul acero
    '#a8432b', // Terracota
    '#b5892e', // Ocre dorado
    '#6b4c7a', // Ciruela mate
    '#2f7373', // Verde azulado profundo
    '#8c3b4a', // Borgoña
    '#5e6f41'  // Verde oliva
];

const COLORES_COMIDA = [
    '#d97757', '#6ba382', '#5b8fb9', '#d4a359', '#9c7ca5', '#c96464'
];

let jugadores = {};
let comida = [];
let orbesX2 = [];

function crearComida(x, y, valor = 1) {
    return {
        x: Math.round(x !== undefined ? x : Math.random() * MAPA_ANCHO),
        y: Math.round(y !== undefined ? y : Math.random() * MAPA_ALTO),
        r: valor === 1 ? Math.round(Math.random() * 2 + 4) : 8,
        v: valor,
        c: COLORES_COMIDA[Math.floor(Math.random() * COLORES_COMIDA.length)]
    };
}

function crearOrbeX2() {
    if (orbesX2.length >= 3) return;
    orbesX2.push({
        id: Math.random().toString(36).substr(2, 6),
        x: Math.round(Math.random() * (MAPA_ANCHO - 300) + 150),
        y: Math.round(Math.random() * (MAPA_ALTO - 300) + 150)
    });
}

for (let i = 0; i < CANTIDAD_COMIDA; i++) {
    comida.push(crearComida());
}
crearOrbeX2();

setInterval(() => {
    crearOrbeX2();
}, 60000);

function normalizarAngulo(ang) {
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    return ang;
}

io.on('connection', (socket) => {
    socket.on('unirse', (nombre) => {
        const startX = Math.random() * (MAPA_ANCHO - 400) + 200;
        const startY = Math.random() * (MAPA_ALTO - 400) + 200;
        let segmentos = [];
        for (let i = 0; i < 20; i++) {
            segmentos.push({ x: startX, y: startY });
        }

        const colorElegido = PALETA_REALISTA[Math.floor(Math.random() * PALETA_REALISTA.length)];

        jugadores[socket.id] = {
            id: socket.id,
            nombre: (typeof nombre === 'string' && nombre.trim()) ? nombre.trim() : 'Jugador',
            x: startX,
            y: startY,
            angulo: 0,
            anguloObjetivo: 0,
            radio: 14,
            longitud: 20,
            velocidad: 4.5,
            turbo: false,
            dobleHasta: 0,
            color: colorElegido,
            segmentos: segmentos
        };
    });

    socket.on('input', (datos) => {
        const j = jugadores[socket.id];
        if (j) {
            j.anguloObjetivo = datos.angulo;
            j.turbo = datos.turbo;
        }
    });

    socket.on('disconnect', () => {
        delete jugadores[socket.id];
    });
});

setInterval(() => {
    const ahora = Date.now();

    for (let id in jugadores) {
        let j = jugadores[id];

        let diff = normalizarAngulo(j.anguloObjetivo - j.angulo);
        if (Math.abs(diff) <= VELOCIDAD_GIRO) {
            j.angulo = j.anguloObjetivo;
        } else {
            j.angulo = normalizarAngulo(j.angulo + Math.sign(diff) * VELOCIDAD_GIRO);
        }

        let velActual = j.velocidad;
        if (j.turbo && j.longitud > 15) {
            velActual = j.velocidad * 1.8;
            j.longitud -= 0.12;
            if (Math.random() < 0.25) {
                const cola = j.segmentos[j.segmentos.length - 1];
                comida.push(crearComida(cola.x, cola.y, 1));
            }
        }

        j.x += Math.cos(j.angulo) * velActual;
        j.y += Math.sin(j.angulo) * velActual;

        j.segmentos.unshift({ x: j.x, y: j.y });
        while (j.segmentos.length > Math.floor(j.longitud)) {
            j.segmentos.pop();
        }

        j.radio = Math.min(28, 14 + (j.longitud - 20) * 0.03);

        for (let i = orbesX2.length - 1; i >= 0; i--) {
            let o = orbesX2[i];
            if (Math.hypot(j.x - o.x, j.y - o.y) < j.radio + 18) {
                j.dobleHasta = ahora + 15000;
                orbesX2.splice(i, 1);
            }
        }

        const multiplicador = (ahora < j.dobleHasta) ? 2 : 1;

        for (let i = comida.length - 1; i >= 0; i--) {
            let c = comida[i];
            let dist = Math.hypot(j.x - c.x, j.y - c.y);
            if (dist < j.radio + c.r) {
                j.longitud += c.v * 0.6 * multiplicador;
                comida.splice(i, 1);
                if (comida.length < CANTIDAD_COMIDA) {
                    comida.push(crearComida());
                }
            }
        }

        if (j.x < 0 || j.x > MAPA_ANCHO || j.y < 0 || j.y > MAPA_ALTO) {
            eliminarJugador(id);
            continue;
        }

        for (let otroId in jugadores) {
            if (id === otroId) continue;
            let otro = jugadores[otroId];
            for (let seg of otro.segmentos) {
                let dist = Math.hypot(j.x - seg.x, j.y - seg.y);
                if (dist < j.radio + otro.radio - 4) {
                    eliminarJugador(id);
                    break;
                }
            }
            if (!jugadores[id]) break;
        }
    }

    let paqueteJugadores = {};
    for (let id in jugadores) {
        let j = jugadores[id];
        paqueteJugadores[id] = {
            id: j.id,
            nombre: j.nombre,
            x: Math.round(j.x),
            y: Math.round(j.y),
            angulo: Number(j.angulo.toFixed(3)),
            radio: Math.round(j.radio),
            longitud: Math.floor(j.longitud),
            turbo: j.turbo,
            doble: ahora < j.dobleHasta,
            tiempoDoble: Math.max(0, Math.ceil((j.dobleHasta - ahora) / 1000)),
            color: j.color,
            segmentos: j.segmentos.map(s => ({ x: Math.round(s.x), y: Math.round(s.y) }))
        };
    }

    io.emit('estado', {
        jugadores: paqueteJugadores,
        comida,
        orbesX2,
        mapa: { ancho: MAPA_ANCHO, alto: MAPA_ALTO }
    });
}, 1000 / 30);

function eliminarJugador(id) {
    const j = jugadores[id];
    if (!j) return;
    for (let i = 0; i < j.segmentos.length; i += 2) {
        comida.push(crearComida(j.segmentos[i].x, j.segmentos[i].y, 3));
    }
    io.to(id).emit('muerto');
    delete jugadores[id];
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor Slither listo en el puerto ${PORT}`);
});
