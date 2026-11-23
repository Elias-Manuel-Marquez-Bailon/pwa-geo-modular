// app.js - Lógica de UI, pre-permiso y consumo de geo-helper.js

const $ = (id) => document.getElementById(id);

const ui = {
  form: $('form-reporte'),
  btnAdjuntar: $('btn-adjuntar'),
  tarjetaPrePermiso: $('tarjeta-prepermiso'),
  btnConfirmar: $('btn-confirmar'),
  btnCancelar: $('btn-cancelar'),
  cargando: $('cargando'),
  cargandoTexto: $('cargando-texto'),
  mensaje: $('mensaje'),
  resultado: $('resultado'),
  resLat: $('res-lat'),
  resLon: $('res-lon'),
  resPrecision: $('res-precision'),
  resHora: $('res-hora'),
  badge: $('badge-precision'),
  enlaceMapa: $('enlace-mapa'),
  selectorManual: $('selector-manual'),
  ayudaPermiso: $('ayuda-permiso'),
  selectZona: $('select-zona'),
  salida: $('salida')
};

let ubicacionAdjunta = null;

// ---------- Helpers de UI ----------
function ocultar(el) { el.hidden = true; }
function mostrar(el) { el.hidden = false; }

function mostrarCargando(texto) {
  ui.cargandoTexto.textContent = texto;
  mostrar(ui.cargando);
  ui.btnAdjuntar.disabled = true;
}

function ocultarCargando() {
  ocultar(ui.cargando);
  ui.btnAdjuntar.disabled = false;
}

function mostrarMensajeError(texto) {
  ui.mensaje.textContent = texto;
  ui.mensaje.className = 'mensaje mensaje--error';
  mostrar(ui.mensaje);
}

function limpiarMensajes() {
  ocultar(ui.mensaje);
  ocultar(ui.tarjetaPrePermiso);
}

function renderizarResultadoUbicacion(ubicacion) {
  const calidad = clasificarPrecision(ubicacion.precisionMetros);
  ui.resLat.textContent = ubicacion.latitud.toFixed(6);
  ui.resLon.textContent = ubicacion.longitud.toFixed(6);
  ui.resPrecision.textContent = '± ' + ubicacion.precisionMetros + ' m';
  ui.resHora.textContent = new Date(ubicacion.timestamp).toLocaleString();
  ui.badge.textContent = calidad.etiqueta;
  ui.badge.className = 'badge badge--' + calidad.nivel;
  ui.enlaceMapa.href = 'https://www.openstreetmap.org/?mlat=' + ubicacion.latitud +
    '&mlon=' + ubicacion.longitud + '#map=17/' + ubicacion.latitud + '/' + ubicacion.longitud;
  mostrar(ui.resultado);
  ocultar(ui.selectorManual);
}

function habilitarSelectorManualZona(mostrarAyudaPermiso) {
  ui.ayudaPermiso.hidden = !mostrarAyudaPermiso;
  mostrar(ui.selectorManual);
  ui.selectZona.focus();
}

// ---------- Lectura real (siempre nace de un click: regla de iOS) ----------
function leerUbicacion() {
  limpiarMensajes();
  mostrarCargando('Obteniendo coordenadas...');

  return obtenerUbicacionActual({ enableHighAccuracy: true, timeout: 8000 })
    .then((ubicacion) => {
      ubicacionAdjunta = ubicacion;
      renderizarResultadoUbicacion(ubicacion);
    })
    .catch((error) => {
      console.warn('[Geo] Fallback activado:', error.message);
      ubicacionAdjunta = null;
      mostrarMensajeError(error.message);
      habilitarSelectorManualZona(error.code === 1); // Plan B sin bloquear al usuario
    })
    .then(ocultarCargando);
}

// ---------- Flujo de pre-permiso ----------
ui.btnAdjuntar.addEventListener('click', () => {
  limpiarMensajes();

  consultarEstadoPermisoGeo().then((estado) => {
    if (estado === 'granted') {
      leerUbicacion();
    } else if (estado === 'denied') {
      mostrarMensajeError('El permiso de ubicación está bloqueado para este sitio.');
      habilitarSelectorManualZona(true);
    } else {
      // 'prompt': explicamos antes de disparar el diálogo nativo
      mostrar(ui.tarjetaPrePermiso);
      ui.btnConfirmar.focus();
    }
  });
});

ui.btnConfirmar.addEventListener('click', leerUbicacion);

ui.btnCancelar.addEventListener('click', () => {
  ocultar(ui.tarjetaPrePermiso);
  habilitarSelectorManualZona(false);
});

// ---------- Envío del reporte (con coordenadas o zona manual) ----------
ui.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const datosFormulario = {
    titulo: $('titulo').value.trim(),
    descripcion: $('descripcion').value.trim()
  };

  const paqueteCompleto = Object.assign({}, datosFormulario, ubicacionAdjunta
    ? { coordenadas: ubicacionAdjunta }
    : { zonaManual: ui.selectZona.value || null });

  console.log('Paquete listo para enviar o encolar en IndexedDB:', paqueteCompleto);
  ui.salida.textContent = JSON.stringify(paqueteCompleto, null, 2);
  mostrar(ui.salida.parentElement);
});

// ---------- Instalación de la PWA ----------
let eventoInstalacionDiferido = null;
const btnInstalar = $('btn-instalar');

function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true; // iOS
}

// Android / Chrome / Edge: capturamos el evento para usar nuestro botón
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  eventoInstalacionDiferido = event;
  btnInstalar.hidden = false;
});

btnInstalar.addEventListener('click', () => {
  if (!eventoInstalacionDiferido) return;
  eventoInstalacionDiferido.prompt();
  eventoInstalacionDiferido.userChoice
    .then((resultado) => {
      console.log('[PWA] Elección del usuario:', resultado.outcome);
      if (resultado.outcome === 'accepted') btnInstalar.hidden = true;
    })
    .finally(() => { eventoInstalacionDiferido = null; });
});

window.addEventListener('appinstalled', () => {
  btnInstalar.hidden = true;
  console.log('[PWA] Aplicación instalada');
});

// iOS / Safari: no existe beforeinstallprompt, mostramos instrucciones manuales
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
if (esIOS && !estaInstalada()) {
  $('aviso-ios').hidden = false;
}
$('btn-cerrar-ios').addEventListener('click', () => { $('aviso-ios').hidden = true; });

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('[SW] Registrado con scope:', reg.scope))
      .catch((err) => console.error('[SW] Error al registrar:', err));
  });
}
