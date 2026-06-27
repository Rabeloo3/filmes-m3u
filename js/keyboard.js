// ==========================================
// ARQUIVO: js/keyboard.js
// ==========================================

// Variável de controle para não tentar forçar a tela cheia a cada tecla apertada
window.fullscreenInitiated = false;

document.addEventListener('keydown', function(event) {
    let elAtivo = document.activeElement;

    // NOVO: Ativa a tela cheia na primeira interação com o teclado/controle
    if (!window.fullscreenInitiated) {
        if (typeof requestFullScreen === 'function') {
            requestFullScreen();
        }
        window.fullscreenInitiated = true; // Marca como ativado
    }

    // Lógica de navegação do seu app (setas do controle remoto)
    switch(event.key) {
        case 'ArrowUp':
            // Lógica para mover o foco para cima
            console.log("Navegando para Cima");
            break;
        case 'ArrowDown':
            // Lógica para mover o foco para baixo
            console.log("Navegando para Baixo");
            break;
        case 'ArrowLeft':
            // Lógica para mover o foco para a esquerda
            console.log("Navegando para Esquerda");
            break;
        case 'ArrowRight':
            // Lógica para mover o foco para a direita
            console.log("Navegando para Direita");
            break;
        case 'Enter':
            // Lógica para confirmar seleção (se não for form submit)
            console.log("Confirmar Seleção / Enter");
            break;
        case 'Escape':
        case 'Backspace':
            // Lógica para botão "Voltar" do controle
            console.log("Voltar");
            break;
        default:
            break;
    }
});
