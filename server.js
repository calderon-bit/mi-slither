const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    transports: ['websocket']
});

app.use(express.static(__dirname));

const MAPA_ANCHO = 3000;
const MAPA_ALTO = 3000;
const CANTIDAD_COMIDA = 650;
const VELOCIDAD_GIRO = 0.085;

const PALETA_REALISTA = [
    '#3b7a57', '#2e5a88', '#a8432b', '#b5892e',
    '#6b4c7a', '#2f7373', '#8c3b4a', '#5e6f41'
];

const COLORES_COMIDA = [
    '#d97757', '#6ba382', '#5b8fb9', '#d4a359', '#9c7ca5', '#c96464'
];

const OTROS_PODERES = ['fantasma', 'turbo'];

let jugadores = {};
let comida = [];
let poderes = [];

function crearComida(x, y, valor = 1) {
    return {
        x: Math.round(x !== undefined ? x : Math.random() * MAPA_ANCHO),
        y: Math.round(y !== undefined ? y : Math.random() * MAPA_ALTO),
        r: valor === 1 ? Math.round(Math.random() * 2 + 4) : 8,
        v: valor,
        c: COLORES_COMIDA[Math.floor(Math.random() * COLORES_COMIDA.length)]
    };
}

function crearPoder(tipoForzado) {
    if (poderes.length >= 5) return;
    const tipo = tipoForzado || OTROS_PODERES[Math.floor(Math.random() * OTROS_PODERES.length)];
    poderes.push({
        id: Math.random().toString(36).substr(2, 6),
        tipo: tipo,
        x: Math.round(Math.random() * (MAPA_ANCHO - 300) + 150),
        y: Math.round(Math.random() * (MAPA_ALTO - 300) + 150)
    });
}

for (let i = 0; i < CANTIDAD_COMIDA; i++) {
    comida.push(crearComida());
}
crearPoder('x2');
crearPoder();

// Cada 30 segundos exactos aparece un orbe x2
setInterval(() => {
    crearPoder('x2');
}, 30000);

// Cada 45 segundos aparece un poder extra (Invencible o Turbo Max)
setInterval(() => {
    crearPoder();
}, 45000);

function normalizarAngulo(ang) {
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    return ang;
}

io.on('connection', (socket) => {
    socket.on('unirse', (datos) => {
        const nombreRaw = typeof datos === 'string' ? datos : (datos && datos.nombre);
        const nombre = (typeof nombreRaw === 'string' && nombreRaw.trim()) ? nombreRaw.trim().slice(0, 15) : 'Jugador';

        const colorSolicitado = datos && datos.color;
        const colorElegido = PALETA_REALISTA.includes(colorSolicitado)
            ? colorSolicitado
            : PALETA_REALISTA[Math.floor(Math.random() * PALETA_REALISTA.length)];

        const startX = Math.random() * (MAPA_ANCHO - 400) + 200;
        const startY = Math.random() * (MAPA_ALTO - 400) + 200;
        let segmentos = [];
        for (let i = 0; i < 20; i++) {
            segmentos.push({ x: startX, y: startY });
        }

        jugadores[socket.id] = {
            id: socket.id,
            nombre: nombre,
            x: startX,
            y: startY,
            angulo: 0,
            anguloObjetivo: 0,
            radio: 14,
            longitud: 20,
            velocidad: 4.5,
            turbo: false,
            dobleHasta: 0,
            fantasmaHasta: 0,
            turboGratisHasta: 0,
            color: colorElegido,
            segmentos: segmentos
        };
    });

    socket.on('input', (datos) => {
        const j = jugadores[socket.id];
        if (j && typeof datos.angulo === 'number' && !isNaN(datos.angulo)) {
            j.anguloObjetivo = datos.angulo;
            j.turbo = Boolean(datos.turbo);
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

        const tieneTurboGratis = ahora < j.turboGratisHasta;
        let velActual = j.velocidad;

        if (tieneTurboGratis) {
            velActual = j.velocidad * 1.9;
        } else if (j.turbo && j.longitud > 15) {
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

        // Recoger orbes de poder
        for (let i = poderes.length - 1; i >= 0; i--) {
            let p = poderes[i];
            if (Math.hypot(j.x - p.x, j.y - p.y) < j.radio + 18) {
                if (p.tipo === 'x2') j.dobleHasta = ahora + 15000;
                if (p.tipo === 'fantasma') j.fantasmaHasta = ahora + 8000;
                if (p.tipo === 'turbo') j.turboGratisHasta = ahora + 10000;
                poderes.splice(i, 1);
            }
        }

        const multiplicador = (ahora < j.dobleHasta) ? 2 : 1;

        // Comer puntitos
        for (let i = comida.length - 1; i >= 0; i--) {
            let c = comida[i];
            if (Math.abs(j.x - c.x) > 45 || Math.abs(j.y - c.y) > 45) continue;

            let dist = Math.hypot(j.x - c.x, j.y - c.y);
            if (dist < j.radio + c.r) {
                j.longitud += c.v * 0.6 * multiplicador;
                comida.splice(i, 1);
                if (comida.length < CANTIDAD_COMIDA) {
                    comida.push(crearComida());
                }
            }
        }

        // Borde del mapa
        if (j.x < 0 || j.x > MAPA_ANCHO || j.y < 0 || j.y > MAPA_ALTO) {
            eliminarJugador(id, null);
            continue;
        }

        // Colisión con otros jugadores
        if (ahora >= j.fantasmaHasta) {
            for (let otroId in jugadores) {
                if (id === otroId) continue;
                let otro = jugadores[otroId];
                if (ahora < otro.fantasmaHasta) continue;

                for (let seg of otro.segmentos) {
                    if (Math.abs(j.x - seg.x) > 60 || Math.abs(j.y - seg.y) > 60) continue;
                    let dist = Math.hypot(j.x - seg.x, j.y - seg.y);
                    if (dist < j.radio + otro.radio - 4) {
                        eliminarJugador(id, otroId);
                        break;
                    }
                }
                if (!jugadores[id]) break;
            }
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
            turbo: j.turbo || (ahora < j.turboGratisHasta),
            doble: ahora < j.dobleHasta,
            fantasma: ahora < j.fantasmaHasta,
            turboGratis: ahora < j.turboGratisHasta,
            tiempoDoble: Math.max(0, Math.ceil((j.dobleHasta - ahora) / 1000)),
            tiempoFantasma: Math.max(0, Math.ceil((j.fantasmaHasta - ahora) / 1000)),
            tiempoTurbo: Math.max(0, Math.ceil((j.turboGratisHasta - ahora) / 1000)),
            color: j.color,
            segmentos: j.segmentos.map(s => ({ x: Math.round(s.x), y: Math.round(s.y) }))
        };
    }

    io.emit('estado', {
        jugadores: paqueteJugadores,
        comida,
        poderes,
        mapa: { ancho: MAPA_ANCHO, alto: MAPA_ALTO }
    });
}, 1000 / 30);

function eliminarJugador(id, asesinoId) {
    const j = jugadores[id];
    if (!j) return;

    for (let i = 0; i < j.segmentos.length; i += 2) {
        comida.push(crearComida(j.segmentos[i].x, j.segmentos[i].y, 3));
    }

    if (asesinoId && jugadores[asesinoId]) {
        jugadores[asesinoId].longitud += 12;
        io.to(asesinoId).emit('eliminacion', j.nombre);
    }

    io.to(id).emit('muerto');
    delete jugadores[id];
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor Slither listo en el puerto ${PORT}`);
});
