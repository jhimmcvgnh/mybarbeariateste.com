/**
 * Promo Pop-up Modal, Minimalist Floating Pen Chat Widget & Green Navbar CTA
 * Barbearia Quiz Funnel
 */

(function () {
  'use strict';

  const TARGET_URL = 'https://quizz-page-fist.vercel.app/';
  const POPUP_INTERVAL_MS = 90 * 1000; // 1:30 minutos exatos (90 segundos = 90.000 ms)

  // Ícone de Caneta Minimalista e Elegante (Feather / Lucide Edit Pen, Detalhes em Preto)
  const PEN_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
      <path d="m15 5 4 4"></path>
    </svg>
  `;

  // Limpa qualquer estado salvo de sessões anteriores para garantir que
  // ao recarregar ou entrar de novo, NENHUM elemento novo apareça antes do X ser clicado!
  try {
    localStorage.removeItem('barber_promo_unlocked');
  } catch (e) {}

  // 1. Injetar o Modal e o Widget Flutuante no DOM
  function injectElements() {
    // --- MODAL DE ANÚNCIO (Inicialmente invisível) ---
    const modalHTML = `
      <div class="promo-modal-backdrop" id="promoModalBackdrop" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="focus-frame-wrapper">
          <!-- 4 Corner Brackets (Camera Focus Frame Pulsing Sequentially) -->
          <div class="focus-corner corner-tl"></div>
          <div class="focus-corner corner-tr"></div>
          <div class="focus-corner corner-bl"></div>
          <div class="focus-corner corner-br"></div>

          <!-- Content Layer (shadcn Card) -->
          <div class="promo-modal-card">
            <button class="promo-modal-close" id="promoModalCloseBtn" aria-label="Fechar">&times;</button>
            
            <!-- Crosshair Focus Icon Circle -->
            <div class="focus-icon-circle">
              <svg class="focus-crosshair-svg" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="22" y1="12" x2="18" y2="12"></line>
                <line x1="6" y1="12" x2="2" y2="12"></line>
                <line x1="12" y1="6" x2="12" y2="2"></line>
                <line x1="12" y1="22" x2="12" y2="18"></line>
              </svg>
            </div>

            <!-- Focus Frame Badge -->
            <div class="focus-badge">jimdev</div>

            <!-- Exact Text (Corrected) -->
            <p class="promo-text">
              Gostou da experiência? Quer melhorias? Um design totalmente novo, personalizado e melhorado? Clique no botão abaixo, responda o quiz necessário que não dura nada e ganhe um presente no final por responder!
            </p>

            <!-- Bottom CTA Bar -->
            <div class="promo-bottom-bar">
              <div class="promo-corner-icon" title="Quiz Rápido">
                <i class="fas fa-magic"></i>
              </div>
              
              <a href="${TARGET_URL}" target="_blank" rel="noopener noreferrer" class="promo-cta-btn" id="promoCtaBtn">
                <span>quero meu projeto completo</span>
                <i class="fas fa-arrow-right"></i>
              </a>

              <div class="promo-corner-icon" title="Presente Exclusivo">
                <i class="fas fa-gift"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // --- WIDGET FLUTUANTE (CANETA MINIMALISTA + CHAT) ---
    const widgetHTML = `
      <div class="floating-chat-widget-container" id="floatingChatWidget">
        <!-- Janela de Chat -->
        <div class="floating-chat-window" id="floatingChatWindow" aria-hidden="true">
          <div class="chat-window-header">
            <div class="chat-header-title">
              ${PEN_ICON_SVG}
              <span>Feedback & Projeto</span>
            </div>
            <button class="chat-close-btn" id="chatCloseBtn" aria-label="Fechar Chat">&times;</button>
          </div>

          <div class="chat-intro-banner">
            <i class="fas fa-comment-dots" style="color:#00e676; margin-right:5px;"></i>
            "deixe coisas que voce não gostou ou que gostaria que seu projeto teria, sua opnião importa no projeto de construção do seu site."
          </div>

          <div class="chat-messages-body" id="chatMessagesBody">
            <!-- Mensagens renderizadas via JS -->
          </div>

          <form class="chat-input-bar" id="chatForm">
            <input type="text" class="chat-input-field" id="chatInputField" placeholder="Digite sua sugestão ou opinião..." required autocomplete="off" />
            <button type="submit" class="chat-send-btn" id="chatSendBtn" title="Enviar Mensagem">
              <i class="fas fa-paper-plane"></i>
            </button>
          </form>
        </div>

        <!-- Botão Circular Flutuante com Ícone de Caneta Minimalista -->
        <button class="floating-pen-btn" id="floatingPenBtn" title="Deixe seu feedback do projeto" type="button">
          ${PEN_ICON_SVG}
        </button>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.insertAdjacentHTML('beforeend', widgetHTML);
  }

  // 2. Controle do Pop-up Modal
  function showPromoModal() {
    const modal = document.getElementById('promoModalBackdrop');
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function hidePromoModal() {
    const modal = document.getElementById('promoModalBackdrop');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  // 3. Desbloqueia os Novos Elementos (APENAS se clicar no "X" do pop-up!)
  function unlockNewElementsOnClose() {
    // 1. Torna visível o botão circular flutuante de caneta no canto inferior direito
    const widget = document.getElementById('floatingChatWidget');
    if (widget) {
      widget.classList.add('visible');
    }

    // 2. Substitui "Perguntas Frequentes" na navbar pelo botão verde
    replaceNavbarFaq();
  }

  // 4. Substituição na Navbar
  function replaceNavbarFaq() {
    const faqLink = document.getElementById('navFaqLink') || document.querySelector('.nav-links a[href="#faq-section"]');
    
    if (faqLink) {
      const parentLi = faqLink.parentElement;
      if (parentLi) {
        parentLi.innerHTML = `
          <a href="${TARGET_URL}" target="_blank" rel="noopener noreferrer" class="nav-green-cta-btn" id="navPromoCtaBtn">
            quero meu projeto completo
          </a>
        `;
      }
    }
  }

  // 5. Gerenciamento do Chat
  const STORAGE_KEY_CHAT = 'barber_chat_feedback_messages';

  function getSavedMessages() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_CHAT)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveMessages(msgs) {
    try {
      localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(msgs));
    } catch (e) {}
  }

  function renderChatMessages() {
    const container = document.getElementById('chatMessagesBody');
    if (!container) return;

    const msgs = getSavedMessages();
    container.innerHTML = '';

    // Mensagem inicial de acolhimento
    const welcomeBubble = document.createElement('div');
    welcomeBubble.className = 'chat-message-bubble bot';
    welcomeBubble.innerHTML = `
      Olá! Sua opinião é fundamental na construção do seu site. Conte-nos o que você achou ou o que gostaria de ver melhorado!
      <span class="chat-message-time">Agora</span>
    `;
    container.appendChild(welcomeBubble);

    msgs.forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = `chat-message-bubble ${msg.sender}`;
      bubble.innerHTML = `
        ${escapeHTML(msg.text)}
        <span class="chat-message-time">${msg.time}</span>
      `;
      container.appendChild(bubble);
    });

    container.scrollTop = container.scrollHeight;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  function handleSendMessage(text) {
    if (!text || !text.trim()) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const msgs = getSavedMessages();
    msgs.push({
      sender: 'user',
      text: text.trim(),
      time: timeStr
    });
    saveMessages(msgs);
    renderChatMessages();

    // Resposta automática de agradecimento
    setTimeout(() => {
      const updatedMsgs = getSavedMessages();
      updatedMsgs.push({
        sender: 'bot',
        text: 'Obrigado pelo seu feedback! Anotamos suas sugestões com cuidado para aprimorar o seu site.',
        time: timeStr
      });
      saveMessages(updatedMsgs);
      renderChatMessages();
    }, 600);
  }

  // 6. Inicialização e Eventos
  function init() {
    injectElements();

    const closeBtn = document.getElementById('promoModalCloseBtn');
    const ctaBtn = document.getElementById('promoCtaBtn');
    const floatingBtn = document.getElementById('floatingPenBtn');
    const chatWindow = document.getElementById('floatingChatWindow');
    const chatCloseBtn = document.getElementById('chatCloseBtn');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInputField');

    // Ao clicar no "X" do pop-up modal:
    // FECHA O POP-UP e FAZ SURGIR OS NOVOS ELEMENTOS (caneta flutuante + botão navbar)
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        hidePromoModal();
        unlockNewElementsOnClose();
      });
    }

    // Ao clicar no CTA dentro do pop-up modal: apenas fecha o pop-up e abre o link
    if (ctaBtn) {
      ctaBtn.addEventListener('click', function () {
        hidePromoModal();
      });
    }

    // Toggle do Chat Flutuante ao clicar na Caneta
    if (floatingBtn && chatWindow) {
      floatingBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = chatWindow.classList.contains('open');
        if (isOpen) {
          chatWindow.classList.remove('open');
          chatWindow.setAttribute('aria-hidden', 'true');
        } else {
          chatWindow.classList.add('open');
          chatWindow.setAttribute('aria-hidden', 'false');
          renderChatMessages();
          if (chatInput) chatInput.focus();
        }
      });
    }

    if (chatCloseBtn && chatWindow) {
      chatCloseBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        chatWindow.classList.remove('open');
        chatWindow.setAttribute('aria-hidden', 'true');
      });
    }

    // Envio do formulário de chat
    if (chatForm && chatInput) {
      chatForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const text = chatInput.value;
        chatInput.value = '';
        handleSendMessage(text);
      });
    }

    // ── RASTREAMENTO DE AGENDAMENTO (5 SEGUNDOS APÓS CONFIRMAR) ──
    let bookingTimer = null;
    function triggerAfterBooking(delayMs = 5000) {
      console.log(`[Rastreio] Agendamento confirmado! O pop-up de anúncio abrirá em ${delayMs / 1000}s.`);
      if (bookingTimer) clearTimeout(bookingTimer);
      bookingTimer = setTimeout(function () {
        showPromoModal();
      }, delayMs);
    }

    // 1. Ouvir evento disparado quando o agendamento é concluído com sucesso
    window.addEventListener('barberBookingConfirmed', function () {
      triggerAfterBooking(5000);
    });

    // 2. Interceptador de clique no botão de confirmar agendamento
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('#btn-confirm, button[id*="confirm"], .btn-booking-confirm');
      const text = e.target && e.target.textContent ? e.target.textContent.trim().toLowerCase() : '';
      if (btn || text === 'confirmar agendamento' || text === 'confirmar') {
        // Dispara o temporizador de 5 segundos após a pessoa apertar em confirmar
        triggerAfterBooking(5000);
      }
    }, true);

    // TEMPORIZADOR DE 1:30 MINUTOS (90 SEGUNDOS):
    // NÃO APARECE AO ENTRAR NEM AO RECARREGAR.
    // O pop-up só aparece pela 1ª vez após 1 minuto e 30 segundos (90.000 ms),
    // e depois continuará aparecendo a cada 1:30 minutos!
    setTimeout(function () {
      showPromoModal();
      // Após os primeiros 1:30 minutos, agenda para continuar aparecendo a cada 1:30 minutos
      setInterval(showPromoModal, POPUP_INTERVAL_MS);
    }, POPUP_INTERVAL_MS);

    // Helpers para testes imediatos sem ter que esperar 1:30 min
    window.openPromoPopup = showPromoModal;
    window.closePromoPopup = hidePromoModal;
    window.simulate1Min30 = function () {
      console.log('⏰ Simulando passagem de 1:30 minutos...');
      showPromoModal();
    };
    window.simulate3Minutes = window.simulate1Min30;
    window.simulate5Minutes = window.simulate1Min30;
    window.simulate10Minutes = window.simulate1Min30;
    window.triggerBookingConfirmed = function () {
      console.log('🧪 Simulando confirmação de agendamento (pop-up em 5s)...');
      triggerAfterBooking(5000);
    };

    // Suporte a teste instantâneo via URL (?simulate=true ou #popup)
    if (window.location.search.includes('simulate') || window.location.hash.includes('popup') || window.location.hash.includes('simulate')) {
      showPromoModal();
    }
  }

  // Iniciar após o carregamento do DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
