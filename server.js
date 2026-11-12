const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const MAPA_ANCHO = 3000;
const MAPA_ALTO = 3000;
const CANTIDAD_COMIDA = 400;

let jugadores = {};
let comida = [];

function crearComida(x, y, valor = 1) {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: x !== undefined ? x : Math.random() * MAPA_ANCHO,
        y: y !== undefined ? y : Math.random() * MAPA_ALTO,
        radio: valor === 1 ? Math.random() * 4 + 3 : 8,
        valor: valor,
        color: `hsl(${Math.random() * 360}, 100%, 60%)`
    };
}

for (let i = 0; i < CANTIDAD_COMIDA; i++) {
    comida.push(crearComida());
}

io.on('connection', (socket) => {
    socket.on('unirse', (nombre) => {
        const startX = Math.random() * (MAPA_ANCHO - 400) + 200;
        const startY = Math.random() * (MAPA_ALTO - 400) + 200;
        let segmentos = [];
        for (let i = 0; i < 20; i++) {
            segmentos.push({ x: startX, y: startY });
        }

        jugadores[socket.id] = {
            id: socket.id,
            nombre: nombre || 'Jugador',
            x: startX,
            y: startY,
            angulo: 0,
            radio: 14,
            longitud: 20,
            velocidad: 3.5,
            turbo: false,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            segmentos: segmentos
        };
    });

    socket.on('input', (datos) => {
        const j = jugadores[socket.id];
        if (j) {
            j.angulo = datos.angulo;
            j.turbo = datos.turbo;
        }
    });

    socket.on('disconnect', () => {
        delete jugadores[socket.id];
    });
});

setInterval(() => {
    for (let id in jugadores) {
        let j = jugadores[id];

        let velActual = j.velocidad;
        if (j.turbo && j.longitud > 15) {
            velActual = j.velocidad * 1.8;
            j.longitud -= 0.08;
            if (Math.random() < 0.2) {
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

        for (let i = comida.length - 1; i >= 0; i--) {
            let c = comida[i];
            let dist = Math.hypot(j.x - c.x, j.y - c.y);
            if (dist < j.radio + c.radio) {
                j.longitud += c.valor * 0.6;
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

    io.emit('estado', { jugadores, comida, mapa: { ancho: MAPA_ANCHO, alto: MAPA_ALTO } });
}, 1000 / 60);

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
