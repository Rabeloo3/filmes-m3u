/* ==========================================================
   APP.JS - CORE OMNI-PLATAFORMA (TIZEN / WEBOS / ANDROID / VEWD)
========================================================== */
var creds = { server: '', user: '', pass: '' };
var currentTab = 'live'; 
var currentItems = [];
var seriesCachedData = {};

window.addEventListener('DOMContentLoaded', function() {
    registrarTeclasNativasTV();
    checkPersistentSession();
    iniciarGuardiaoKiosk();
});

function registrarTeclasNativasTV() {
    // 1. FORÇA REGISTRO DE TECLAS NO SAMSUNG TIZEN (Se não fizer isso, o controle não responde)
    if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
        var teclasTizen = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Info', 'ChannelUp', 'ChannelDown', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'];
        for (var i = 0; i < teclasTizen.length; i++) {
            try { tizen.tvinputdevice.registerKey(teclasTizen[i]); } catch(e){}
        }
    }
    // 2. FORÇA SUPORTE AO BOTÃO VOLTAR NO LG WEBOS
    if (typeof webOS !== 'undefined' && webOS.platformBack) {
        window.addEventListener('webOSLaunch', function() {});
    }
}

function iniciarGuardiaoKiosk() {
    var doc = document.documentElement;
    var requisitar = function() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            var m = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.msRequestFullscreen || doc.mozRequestFullScreen;
            if (m) { try { m.call(doc); } catch(e){} }
        }
    };

    var eventos = ['keydown', 'click', 'touchstart'];
    for (var i = 0; i < eventos.length; i++) {
        window.addEventListener(eventos[i], requisitar, false);
    }
}